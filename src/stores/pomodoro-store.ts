import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FocusMode, PomodoroPhase } from "@/types";
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

export interface StartForTaskOptions {
  focusMode?: FocusMode;
  sessionName?: string | null;
  /** Restore the task's cycle count so long-break cadence resumes exactly. */
  completedFocusCount?: number;
  /** Per-task break cadence; overrides the workspace config for this run. */
  breaks?: BreakOverride | null;
}

interface PomodoroActions {
  start: (phase?: PomodoroPhase, plannedMs?: number) => void;
  startForTask: (
    taskId: string,
    taskTitle: string,
    plannedMs?: number,
    opts?: StartForTaskOptions
  ) => void;
  /**
   * Quick focus with a custom duration. Pass `credit` to count the finished
   * minutes toward a task (its progress absorbs them); omit it (null) and
   * the session stays independent — logged to History, credited nowhere.
   */
  startQuick: (
    title?: string | null,
    plannedMs?: number,
    breaks?: BreakOverride,
    credit?: QuickCredit | null
  ) => void;
  setActiveTask: (taskId: string | null, taskTitle?: string | null) => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  cancel: () => void;
  reset: () => void;
  extend: (minutes: number) => void;
  /** Rename the active Infinite session (also reflected in History/Dashboard). */
  setSessionName: (name: string | null) => void;
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
   * The custom label typed for a quick session (null = not a quick session).
   * When set alongside `activeTaskId`, the quick block counts toward that
   * task; with a null task id it runs independent. Cleared by task starts
   * and by `reset()` back to standby.
   */
  quickLabel: string | null;
  /**
   * Per-quick-session break cadence (ms + interval). Set by `startQuick`,
   * cleared by task sessions and by global cadence edits in Settings.
   * Null = follow the workspace `config`.
   */
  breakOverride: BreakOverride | null;
  /**
   * Scheduling mode of the live session. "allocated" = classic Pomodoro;
   * "infinite" = open-ended (session.isInfinite is true, no expiry).
   */
  focusMode: FocusMode;
  /**
   * User-provided Infinite session label (e.g. "JavaScript Deep Dive").
   * Shown in Focus Mode, History and Dashboard. Null = use task title.
   */
  sessionName: string | null;
}

/**
 * Attribution target for a quick session: the in-progress task its finished
 * minutes should count toward. Null = independent session.
 */
export interface QuickCredit {
  taskId: string;
  taskTitle: string;
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

/**
 * Build a break override from a task's per-task cadence. Null when the task
 * has no overrides, so the workspace config applies.
 */
export function taskBreaks(t: {
  shortBreakMinutes?: number | null;
  longBreakMinutes?: number | null;
  longBreakInterval?: number | null;
}): BreakOverride | null {
  const out: BreakOverride = {};
  if (t.shortBreakMinutes != null) out.shortBreakMs = t.shortBreakMinutes * 60000;
  if (t.longBreakMinutes != null) out.longBreakMs = t.longBreakMinutes * 60000;
  if (t.longBreakInterval != null) out.longBreakInterval = t.longBreakInterval;
  return Object.keys(out).length > 0 ? out : null;
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
       * partial work is silently lost. History carries the session mode +
       * name so Infinite and Allocated stay distinguishable downstream.
       */
      const preemptIfActive = () => {
        const { session, activeTaskId, activeTaskTitle, focusMode, sessionName } = get();
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
              sessionMode: focusMode,
              sessionName,
              breakMs: 0,
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
      quickLabel: null,
      breakOverride: null,
      focusMode: "allocated" as FocusMode,
      sessionName: null,

      start: (phase, plannedMs) => {
        preemptIfActive();
        const { session, config } = get();
        const now = Date.now();
        set({
          focusMode: "allocated",
          sessionName: null,
          session: startSession(session, now, {
            phase: phase ?? (session.phase as PomodoroPhase),
            config,
            ...(plannedMs ? { plannedMs } : {}),
            isInfinite: false,
          }),
        });
      },

      startForTask: (taskId, taskTitle, plannedMs, opts) => {
        preemptIfActive();
        const { session, config } = get();
        const now = Date.now();
        const mode: FocusMode = opts?.focusMode === "infinite" ? "infinite" : "allocated";
        const name =
          mode === "infinite"
            ? ((opts?.sessionName ?? "").trim().slice(0, 200) || null)
            : null;
        const restoredCount = Math.max(
          0,
          Math.round(opts?.completedFocusCount ?? session.completedFocusCount ?? 0)
        );
        const fresh = createIdleState("FOCUS", config, restoredCount, mode === "infinite");
        set({
          activeTaskId: taskId,
          activeTaskTitle: taskTitle,
          // A task slice is not a quick session — clear the quick label.
          quickLabel: null,
          // Use the task's own break cadence when it has one, else the workspace config.
          breakOverride: opts?.breaks ? normalizeBreakOverride(opts.breaks) : null,
          focusMode: mode,
          sessionName: name,
          session: startSession(fresh, now, {
            phase: "FOCUS",
            config,
            ...(mode === "infinite"
              ? { plannedMs: 0, isInfinite: true }
              : plannedMs
                ? { plannedMs, isInfinite: false }
                : { isInfinite: false }),
          }),
        });
      },

      startQuick: (title, plannedMs, breaks, credit) => {
        preemptIfActive();
        const { session, config } = get();
        const now = Date.now();
        const label = (title ?? "").trim().slice(0, 200) || "Deep Work Session";
        const ms =
          plannedMs && Number.isFinite(plannedMs) && plannedMs > 0
            ? Math.round(Math.min(Math.max(plannedMs, 5 * 60000), 180 * 60000))
            : undefined;
        const fresh = createIdleState("FOCUS", config, session.completedFocusCount, false);
        set({
          // Credited quick: minutes count toward the task on completion.
          // Independent quick: no link, logged to History only.
          activeTaskId: credit?.taskId ?? null,
          activeTaskTitle: credit?.taskTitle ?? label,
          quickLabel: label,
          breakOverride:
            breaks &&
            (breaks.shortBreakMs !== undefined ||
              breaks.longBreakMs !== undefined ||
              breaks.longBreakInterval !== undefined)
              ? normalizeBreakOverride(breaks)
              : null,
          focusMode: "allocated",
          sessionName: null,
          session: startSession(fresh, now, {
            phase: "FOCUS",
            config,
            ...(ms ? { plannedMs: ms } : {}),
            isInfinite: false,
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
          // Back to standby: no live quick session anymore.
          quickLabel: null,
          focusMode: "allocated",
          sessionName: null,
          session: createIdleState(
            session.phase as PomodoroPhase,
            config,
            session.completedFocusCount,
            false
          ),
        });
      },

      extend: (minutes) => {
        const { session } = get();
        if (session.isInfinite) return;
        set({ session: extendSession(session, Math.round(minutes * 60000)) });
      },

      setSessionName: (name) => {
        const clean = (name ?? "").trim().slice(0, 200) || null;
        set({ sessionName: clean });
      },

      detachTask: (taskId) => {
        const { session, activeTaskId, activeTaskTitle, focusMode, sessionName } = get();
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
                sessionMode: focusMode,
                sessionName,
                breakMs: 0,
              });
            }
            set({ session: snap, activeTaskId: null, activeTaskTitle: null, focusMode: "allocated", sessionName: null });
            return;
          } catch {
            // Fall through to unlink below.
          }
        }
        set({ activeTaskId: null, activeTaskTitle: null, focusMode: "allocated", sessionName: null });
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
        const fresh = createIdleState(next, config, session.completedFocusCount, false);
        set({
          focusMode: "allocated",
          sessionName: null,
          session: startSession(fresh, Date.now(), {
            phase: next,
            config,
            plannedMs: getPlannedMsForPhase(next, effConfig),
            isInfinite: false,
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
      version: 2,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({
        session: s.session,
        config: s.config,
        activeTaskId: s.activeTaskId,
        activeTaskTitle: s.activeTaskTitle,
        quickLabel: s.quickLabel,
        breakOverride: s.breakOverride,
        focusMode: s.focusMode,
        sessionName: s.sessionName,
      }) as unknown as PomodoroStore,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Partial<PomodoroStore>;
        if (version < 2) {
          const session = (state.session ?? createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG)) as PomodoroState;
          return {
            session: { isInfinite: false, ...session },
            config: state.config ?? DEFAULT_POMODORO_CONFIG,
            activeTaskId: state.activeTaskId ?? null,
            activeTaskTitle: state.activeTaskTitle ?? null,
            quickLabel: state.quickLabel ?? null,
            breakOverride: state.breakOverride ?? null,
            focusMode: (state as PomodoroStore).focusMode === "infinite" ? "infinite" : "allocated",
            sessionName: (state as PomodoroStore).sessionName ?? null,
          } as PomodoroStore;
        }
        return state as PomodoroStore;
      },
    }
  )
);
