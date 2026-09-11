import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PomodoroPhase } from "@/types";
import {
  DEFAULT_POMODORO_CONFIG,
  getBreakPhaseAfterFocus,
  getPlannedMsForPhase,
  type PomodoroConfig,
} from "@/lib/pomodoro-config";
import {
  cancelSession,
  completeSession,
  createIdleState,
  extendSession,
  getElapsedFocusMs,
  getPausedMs,
  pauseSession,
  resumeSession,
  startSession,
  type PomodoroState,
} from "@/lib/pomodoro-machine";
import { useSessionHistoryStore } from "@/stores/session-history-store";

interface PomodoroActions {
  start: (phase?: PomodoroPhase, plannedMs?: number) => void;
  startForTask: (taskId: string, taskTitle: string, plannedMs?: number) => void;
  /** Allocation-free quick focus: no task link, optional label + duration. */
  startQuick: (
    title?: string | null,
    plannedMs?: number,
    breaks?: BreakOverride
  ) => void;
  setActiveTask: (taskId: string | null, taskTitle?: string | null) => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  cancel: () => void;
  reset: () => void;
  extend: (minutes: number) => void;
  startBreak: () => void;
  /**
   * Called when the linked task is deleted. Stops a live timer (partial work
   * is preserved in History as CANCELLED) and clears the link so no stale
   * task lingers on the dashboard.
   */
  detachTask: (taskId: string) => void;
  setConfig: (patch: Partial<PomodoroConfig>) => void;
}

interface PomodoroStore extends PomodoroActions {
  session: PomodoroState;
  config: PomodoroConfig;
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  /**
   * Per-quick-session break cadence (ms + interval). Set by `startQuick`,
   * cleared by task sessions and by global cadence edits in Settings.
   * Null = follow the workspace `config`.
   */
  breakOverride: BreakOverride | null;
}

/**
 * Per-session break cadence override for allocation-free quick focus.
 * Any field left undefined falls back to the workspace config.
 */
export interface BreakOverride {
  shortBreakMs?: number;
  longBreakMs?: number;
  longBreakInterval?: number;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function normalizeBreakOverride(b: BreakOverride): BreakOverride {
  const out: BreakOverride = {};
  if (b.shortBreakMs !== undefined)
    out.shortBreakMs = clampInt(b.shortBreakMs, 1 * 60000, 60 * 60000);
  if (b.longBreakMs !== undefined)
    out.longBreakMs = clampInt(b.longBreakMs, 1 * 60000, 120 * 60000);
  if (b.longBreakInterval !== undefined)
    out.longBreakInterval = clampInt(b.longBreakInterval, 2, 12);
  return out;
}

/** Workspace config with the quick-session override applied where set. */
export function resolveBreaks(
  config: PomodoroConfig,
  override: BreakOverride | null
): { shortBreakMs: number; longBreakMs: number; longBreakInterval: number } {
  return {
    shortBreakMs: override?.shortBreakMs ?? config.shortBreakMs,
    longBreakMs: override?.longBreakMs ?? config.longBreakMs,
    longBreakInterval: override?.longBreakInterval ?? config.longBreakInterval,
  };
}

const STORAGE_KEY = "tempo-pomodoro-v1";

// No-op storage for SSR (Next.js prerender has no localStorage)
const ssrSafeStorage = () => {
  if (typeof window !== "undefined") return localStorage;
  return {
    getItem: (_k: string) => null,
    setItem: (_k: string, _v: string) => {},
    removeItem: (_k: string) => {},
  };
};

export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set, get) => {
      /**
       * Single-active invariant: at most one pomodoro runs at a time.
       * Starting anything new first stops the live session (CANCELLED +
       * written to History) so parallel timers are impossible and no
       * partial work is silently lost.
       */
      const preemptIfActive = () => {
        const { session, activeTaskId, activeTaskTitle } = get();
        if (session.status !== "RUNNING" && session.status !== "PAUSED") return;
        const at = Date.now();
        try {
          const snap = cancelSession(session, at);
          if (snap.startedAt !== null && snap.endedAt !== null) {
            useSessionHistoryStore.getState().logSession({
              taskId: activeTaskId,
              taskTitle: activeTaskTitle,
              phase: snap.phase,
              status: "CANCELLED",
              plannedMs: snap.plannedMs,
              startedAt: snap.startedAt,
              endedAt: snap.endedAt,
              focusedMs: getElapsedFocusMs(snap, at),
              pausedMs: getPausedMs(snap, at),
              interruptions: snap.pauseCount,
              events: snap.events,
            });
          }
          set({ session: snap });
        } catch {
          // Already terminal — nothing to stop.
        }
      };

      return {
      session: createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG),
      config: DEFAULT_POMODORO_CONFIG,
      activeTaskId: null,
      activeTaskTitle: null,
      breakOverride: null,

      start: (phase, plannedMs) => {
        preemptIfActive();
        const { session, config } = get();
        const now = Date.now();
        set({
          session: startSession(session, now, {
            phase: phase ?? (session.phase as PomodoroPhase),
            config,
            ...(plannedMs ? { plannedMs } : {}),
          }),
        });
      },

      startForTask: (taskId, taskTitle, plannedMs) => {
        preemptIfActive();
        const { session, config } = get();
        const now = Date.now();
        const fresh = createIdleState("FOCUS", config, session.completedFocusCount);
        set({
          activeTaskId: taskId,
          activeTaskTitle: taskTitle,
          // Task sessions follow task/global cadence — drop any quick override.
          breakOverride: null,
          session: startSession(fresh, now, {
            phase: "FOCUS",
            config,
            ...(plannedMs ? { plannedMs } : {}),
          }),
        });
      },

      startQuick: (title, plannedMs, breaks) => {
        preemptIfActive();
        const { session, config } = get();
        const now = Date.now();
        const label = (title ?? "").trim().slice(0, 200) || "Deep Work Session";
        const ms =
          plannedMs && Number.isFinite(plannedMs) && plannedMs > 0
            ? Math.round(Math.min(Math.max(plannedMs, 5 * 60000), 180 * 60000))
            : undefined;
        const fresh = createIdleState("FOCUS", config, session.completedFocusCount);
        set({
          activeTaskId: null,
          activeTaskTitle: label,
          breakOverride:
            breaks &&
            (breaks.shortBreakMs !== undefined ||
              breaks.longBreakMs !== undefined ||
              breaks.longBreakInterval !== undefined)
              ? normalizeBreakOverride(breaks)
              : null,
          session: startSession(fresh, now, {
            phase: "FOCUS",
            config,
            ...(ms ? { plannedMs: ms } : {}),
          }),
        });
      },

      setActiveTask: (taskId, taskTitle = null) => {
        set({ activeTaskId: taskId, activeTaskTitle: taskTitle });
      },

      pause: () => {
        const { session } = get();
        set({ session: pauseSession(session, Date.now()) });
      },

      resume: () => {
        const { session } = get();
        set({ session: resumeSession(session, Date.now()) });
      },

      complete: () => {
        const { session } = get();
        set({ session: completeSession(session, Date.now()) });
      },

      cancel: () => {
        const { session } = get();
        set({ session: cancelSession(session, Date.now()) });
      },

      reset: () => {
        const { config, session } = get();
        set({
          session: createIdleState(
            session.phase as PomodoroPhase,
            config,
            session.completedFocusCount
          ),
        });
      },

      extend: (minutes) => {
        const { session } = get();
        set({ session: extendSession(session, Math.round(minutes * 60000)) });
      },

      detachTask: (taskId) => {
        const { session, activeTaskId, activeTaskTitle } = get();
        if (activeTaskId !== taskId) return;
        if (
          (session.status === "RUNNING" || session.status === "PAUSED") &&
          session.startedAt !== null
        ) {
          const at = Date.now();
          try {
            const snap = cancelSession(session, at);
            if (snap.startedAt !== null && snap.endedAt !== null) {
              useSessionHistoryStore.getState().logSession({
                taskId,
                taskTitle: activeTaskTitle,
                phase: snap.phase,
                status: "CANCELLED",
                plannedMs: snap.plannedMs,
                startedAt: snap.startedAt,
                endedAt: snap.endedAt,
                focusedMs: getElapsedFocusMs(snap, at),
                pausedMs: getPausedMs(snap, at),
                interruptions: snap.pauseCount,
                events: snap.events,
              });
            }
            set({ session: snap, activeTaskId: null, activeTaskTitle: null });
            return;
          } catch {
            // Fall through to unlink below.
          }
        }
        set({ activeTaskId: null, activeTaskTitle: null });
      },

      startBreak: () => {
        preemptIfActive();
        const { session, config, breakOverride } = get();
        const eff = resolveBreaks(config, breakOverride);
        const effConfig: PomodoroConfig = {
          ...config,
          shortBreakMs: eff.shortBreakMs,
          longBreakMs: eff.longBreakMs,
          longBreakInterval: eff.longBreakInterval,
        };
        const next: PomodoroPhase =
          session.phase === "FOCUS"
            ? getBreakPhaseAfterFocus(session.completedFocusCount, effConfig)
            : "FOCUS";
        const fresh = createIdleState(next, config, session.completedFocusCount);
        set({
          session: startSession(fresh, Date.now(), {
            phase: next,
            config,
            plannedMs: getPlannedMsForPhase(next, effConfig),
          }),
        });
      },

      setConfig: (patch) => {
        const { config } = get();
        const next = { ...config, ...patch };
        // A global cadence edit wins over any quick-session override.
        const touchesBreaks =
          patch.shortBreakMs !== undefined ||
          patch.longBreakMs !== undefined ||
          patch.longBreakInterval !== undefined;
        set({
          config: next,
          ...(touchesBreaks ? { breakOverride: null } : {}),
        });
      },
      };
    },
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({
        session: s.session,
        config: s.config,
        activeTaskId: s.activeTaskId,
        activeTaskTitle: s.activeTaskTitle,
        breakOverride: s.breakOverride,
      }) as unknown as PomodoroStore,
    }
  )
);
