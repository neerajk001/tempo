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
  /**
   * Pause the live session. Accepts an optional break length for Infinite
   * Focus (pause auto-starts break tracking); extra event args from
   * `onClick={pause}` are safely ignored.
   */
  pause: (arg?: unknown) => void;
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
  /**
   * Active break countdown for a PAUSED Infinite Focus session. Started
   * automatically on pause with the user's configured break duration;
   * cleared on resume/complete/cancel. Focus time stays frozen while set;
   * break time is tracked separately from focused time.
   */
  infiniteBreak: InfiniteBreakState | null;
  /**
   * Accumulated break ms across resumed pause-breaks in the current
   * Infinite run. Added to on resume; the open break (if paused) is added
   * on top at completion/switch time. Reset on start.
   */
  infiniteBreakTotalMs: number;
}

/**
 * Break countdown attached to a paused Infinite Focus session.
 */
export interface InfiniteBreakState {
  startedAt: number;
  plannedMs: number;
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

/** Elapsed break ms for a paused Infinite session (capped at >= 0). */
export function getInfiniteBreakElapsed(
  brk: InfiniteBreakState | null,
  now: number
): number {
  if (!brk) return 0;
  return Math.max(0, now - brk.startedAt);
}

/** Remaining break ms for a paused Infinite session (0 when complete). */
export function getInfiniteBreakRemaining(
  brk: InfiniteBreakState | null,
  now: number
): number {
  if (!brk) return 0;
  return Math.max(0, brk.plannedMs - getInfiniteBreakElapsed(brk, now));
}

/** True once the Infinite pause-break countdown has fully elapsed. */
export function isInfiniteBreakComplete(
  brk: InfiniteBreakState | null,
  now: number
): boolean {
  if (!brk) return false;
  return now - brk.startedAt >= brk.plannedMs;
}

/** Resolve the break length for an Infinite pause (task override wins). */
export function resolveInfiniteBreakMs(
  config: PomodoroConfig,
  opts?: { taskShortBreakMinutes?: number | null; breakMs?: number }
): number {
  if (opts?.breakMs && Number.isFinite(opts.breakMs) && opts.breakMs > 0) {
    return Math.max(60000, Math.min(120 * 60000, Math.round(opts.breakMs)));
  }
  if (
    opts?.taskShortBreakMinutes !== undefined &&
    opts.taskShortBreakMinutes !== null &&
    Number.isFinite(opts.taskShortBreakMinutes)
  ) {
    const m = Math.round(opts.taskShortBreakMinutes);
    if (m >= 1 && m <= 60) return m * 60000;
  }
  return config.shortBreakMs;
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
        const { session, activeTaskId, activeTaskTitle, focusMode, sessionName, infiniteBreak, infiniteBreakTotalMs } = get();
        if (session.status !== "RUNNING" && session.status !== "PAUSED") return;
        const at = Date.now();
        try {
          const snap = cancelSession(session, at);
          if (snap.startedAt !== null && snap.endedAt !== null) {
            // Infinite break time is the actual paused duration (tracked
            // separately from focused time); the countdown is display only.
            const brkMs =
              focusMode === "infinite"
                ? Math.max(0, Math.round((infiniteBreakTotalMs ?? 0) + (infiniteBreak ? at - infiniteBreak.startedAt : 0)))
                : 0;
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
              breakMs: focusMode === "infinite" ? brkMs : 0,
            });
          }
          set({ session: snap, infiniteBreak: null });
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
      infiniteBreak: null,
      infiniteBreakTotalMs: 0,

      start: (phase, plannedMs) => {
        preemptIfActive();
        const { session, config } = get();
        const now = Date.now();
        set({
          focusMode: "allocated",
          sessionName: null,
          infiniteBreak: null,
          infiniteBreakTotalMs: 0,
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
          // Task sessions follow task/global cadence — drop any quick override.
          breakOverride: null,
          focusMode: mode,
          sessionName: name,
          infiniteBreak: null,
          infiniteBreakTotalMs: 0,
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
          infiniteBreak: null,
          infiniteBreakTotalMs: 0,
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

      pause: (arg) => {
        const { session, config, focusMode } = get();
        const at = Date.now();
        const next = pauseSession(session, at);
        if (focusMode === "infinite" && next.status === "PAUSED") {
          // Infinite pause auto-starts break tracking with the configured
          // duration. Callers may pass { breakMs } (task override) or a
          // raw ms number; click events are ignored.
          let breakMs: number | undefined;
          if (typeof arg === "number" && Number.isFinite(arg)) breakMs = arg;
          else if (arg && typeof arg === "object" && "breakMs" in (arg as Record<string, unknown>)) {
            const v = (arg as Record<string, unknown>).breakMs;
            if (typeof v === "number" && Number.isFinite(v)) breakMs = v;
          }
          const plannedMs = resolveInfiniteBreakMs(config, { breakMs });
          set({ session: next, infiniteBreak: { startedAt: at, plannedMs } });
        } else {
          set({ session: next });
        }
      },

      resume: () => {
        const { session, infiniteBreak, infiniteBreakTotalMs, focusMode } = get();
        const at = Date.now();
        // Resuming before the break finishes stops the break timer and
        // resumes focus; the elapsed break is folded into the run total
        // (tracked separately from focused time).
        const addBreak =
          focusMode === "infinite" && infiniteBreak
            ? Math.max(0, at - infiniteBreak.startedAt)
            : 0;
        set({
          session: resumeSession(session, at),
          infiniteBreak: null,
          infiniteBreakTotalMs: Math.max(0, Math.round((infiniteBreakTotalMs ?? 0) + addBreak)),
        });
      },

      complete: () => {
        const { session } = get();
        set({ session: completeSession(session, Date.now()), infiniteBreak: null });
      },

      cancel: () => {
        const { session } = get();
        set({ session: cancelSession(session, Date.now()), infiniteBreak: null });
      },

      reset: () => {
        const { config, session } = get();
        set({
          // Back to standby: no live quick session anymore.
          quickLabel: null,
          focusMode: "allocated",
          sessionName: null,
          infiniteBreak: null,
          infiniteBreakTotalMs: 0,
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
        const { session, activeTaskId, activeTaskTitle, focusMode, sessionName, infiniteBreak, infiniteBreakTotalMs } = get();
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
                breakMs:
                  focusMode === "infinite"
                    ? Math.max(0, Math.round((infiniteBreakTotalMs ?? 0) + (infiniteBreak ? at - infiniteBreak.startedAt : 0)))
                    : 0,
              });
            }
            set({ session: snap, activeTaskId: null, activeTaskTitle: null, focusMode: "allocated", sessionName: null, infiniteBreak: null, infiniteBreakTotalMs: 0 });
            return;
          } catch {
            // Fall through to unlink below.
          }
        }
        set({ activeTaskId: null, activeTaskTitle: null, focusMode: "allocated", sessionName: null, infiniteBreak: null, infiniteBreakTotalMs: 0 });
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
          infiniteBreak: null,
          infiniteBreakTotalMs: 0,
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
        infiniteBreak: s.infiniteBreak,
        infiniteBreakTotalMs: s.infiniteBreakTotalMs,
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
            infiniteBreak: (state as PomodoroStore).infiniteBreak ?? null,
            infiniteBreakTotalMs: (state as PomodoroStore).infiniteBreakTotalMs ?? 0,
          } as PomodoroStore;
        }
        return state as PomodoroStore;
      },
    }
  )
);
