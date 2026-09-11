import type { PomodoroPhase, PomodoroStatus, SessionEventType } from "@/types";
import { DEFAULT_POMODORO_CONFIG, getPlannedMsForPhase, type PomodoroConfig } from "./pomodoro-config";

export class InvalidPomodoroTransition extends Error {
  constructor(from: PomodoroStatus, action: string) {
    super(`Invalid pomodoro transition: cannot ${action} from ${from}`);
    this.name = "InvalidPomodoroTransition";
  }
}

export interface PomodoroEvent {
  type: SessionEventType;
  at: number; // epoch ms
}

export interface PomodoroState {
  status: PomodoroStatus;
  phase: PomodoroPhase;
  /** epoch ms when the current run started (null until START) */
  startedAt: number | null;
  /** epoch ms when paused (null unless PAUSED) */
  pausedAt: number | null;
  /** epoch ms when completed/cancelled (null until terminal) */
  endedAt: number | null;
  /** accumulated paused time in ms (excludes current open pause) */
  totalPausedMs: number;
  pauseCount: number;
  plannedMs: number;
  /** completed FOCUS sessions in this cycle, drives long-break interval */
  completedFocusCount: number;
  events: PomodoroEvent[];
}

export function createIdleState(
  phase: PomodoroPhase = "FOCUS",
  config: PomodoroConfig = DEFAULT_POMODORO_CONFIG,
  completedFocusCount = 0
): PomodoroState {
  return {
    status: "IDLE",
    phase,
    startedAt: null,
    pausedAt: null,
    endedAt: null,
    totalPausedMs: 0,
    pauseCount: 0,
    plannedMs: getPlannedMsForPhase(phase, config),
    completedFocusCount,
    events: [],
  };
}

function pushEvent(state: PomodoroState, type: SessionEventType, at: number): PomodoroEvent[] {
  return [...state.events, { type, at }];
}

/** START: IDLE | COMPLETED | CANCELLED -> RUNNING (fresh timestamps) */
export function startSession(
  state: PomodoroState,
  now: number,
  opts?: { phase?: PomodoroPhase; config?: PomodoroConfig; plannedMs?: number }
): PomodoroState {
  if (state.status !== "IDLE" && state.status !== "COMPLETED" && state.status !== "CANCELLED") {
    throw new InvalidPomodoroTransition(state.status, "START");
  }
  const config = opts?.config ?? DEFAULT_POMODORO_CONFIG;
  const phase = opts?.phase ?? state.phase ?? "FOCUS";
  const plannedMs = opts?.plannedMs ?? getPlannedMsForPhase(phase, config);
  return {
    status: "RUNNING",
    phase,
    startedAt: now,
    pausedAt: null,
    endedAt: null,
    totalPausedMs: 0,
    pauseCount: 0,
    plannedMs,
    completedFocusCount: state.completedFocusCount,
    events: [...state.events, { type: "START", at: now }],
  };
}

/** PAUSE: RUNNING -> PAUSED */
export function pauseSession(state: PomodoroState, now: number): PomodoroState {
  if (state.status !== "RUNNING" || state.startedAt === null) {
    throw new InvalidPomodoroTransition(state.status, "PAUSE");
  }
  if (now < state.startedAt) {
    throw new Error("Cannot pause before start time");
  }
  return {
    ...state,
    status: "PAUSED",
    pausedAt: now,
    pauseCount: state.pauseCount + 1,
    events: pushEvent(state, "PAUSE", now),
  };
}

/** RESUME: PAUSED -> RUNNING, folds the open pause into totalPausedMs */
export function resumeSession(state: PomodoroState, now: number): PomodoroState {
  if (state.status !== "PAUSED" || state.pausedAt === null) {
    throw new InvalidPomodoroTransition(state.status, "RESUME");
  }
  if (now < state.pausedAt) {
    throw new Error("Cannot resume before pause time");
  }
  return {
    ...state,
    status: "RUNNING",
    totalPausedMs: state.totalPausedMs + (now - state.pausedAt),
    pausedAt: null,
    events: pushEvent(state, "RESUME", now),
  };
}

function terminalState(
  state: PomodoroState,
  now: number,
  type: "COMPLETE" | "CANCEL"
): PomodoroState {
  if (state.status !== "RUNNING" && state.status !== "PAUSED") {
    throw new InvalidPomodoroTransition(state.status, type);
  }
  // If completing/cancelling from PAUSED, the open pause counts as paused time.
  const extraPaused = state.status === "PAUSED" && state.pausedAt !== null ? now - state.pausedAt : 0;
  const completedFocusCount =
    type === "COMPLETE" && state.phase === "FOCUS"
      ? state.completedFocusCount + 1
      : state.completedFocusCount;
  return {
    ...state,
    status: type === "COMPLETE" ? "COMPLETED" : "CANCELLED",
    totalPausedMs: state.totalPausedMs + extraPaused,
    pausedAt: null,
    endedAt: now,
    completedFocusCount,
    events: pushEvent(
      { ...state, totalPausedMs: state.totalPausedMs + extraPaused },
      type,
      now
    ),
  };
}

/** COMPLETE: RUNNING | PAUSED -> COMPLETED */
export function completeSession(state: PomodoroState, now: number): PomodoroState {
  return terminalState(state, now, "COMPLETE");
}

/** CANCEL: RUNNING | PAUSED -> CANCELLED */
export function cancelSession(state: PomodoroState, now: number): PomodoroState {
  return terminalState(state, now, "CANCEL");
}

/** EXTEND: lengthen the plan of a live session (e.g. "+5m"). Timestamps untouched. */
export function extendSession(state: PomodoroState, extraMs: number): PomodoroState {
  if (state.status !== "RUNNING" && state.status !== "PAUSED") {
    throw new InvalidPomodoroTransition(state.status, "EXTEND");
  }
  if (!Number.isFinite(extraMs) || extraMs <= 0) {
    throw new Error("extend requires a positive duration");
  }
  return { ...state, plannedMs: state.plannedMs + Math.round(extraMs) };
}

// ---------------------------------------------------------------------------
// Timestamp-based calculations (source of truth = timestamps, not ticks)
// ---------------------------------------------------------------------------

/** Reference "now" for a state: endedAt for terminal states, otherwise provided now. */
function effectiveNow(state: PomodoroState, now: number): number {
  if (state.endedAt !== null) return state.endedAt;
  return now;
}

export function getPausedMs(state: PomodoroState, now: number): number {
  if (state.startedAt === null) return 0;
  const ref = effectiveNow(state, now);
  const openPause =
    state.status === "PAUSED" && state.pausedAt !== null ? Math.max(0, ref - state.pausedAt) : 0;
  return state.totalPausedMs + openPause;
}

/** Actual focused time = wall time since start minus all paused time. */
export function getElapsedFocusMs(state: PomodoroState, now: number): number {
  if (state.startedAt === null) return 0;
  const ref = effectiveNow(state, now);
  const wall = Math.max(0, ref - state.startedAt);
  return Math.max(0, wall - getPausedMs(state, now));
}

export function getRemainingMs(state: PomodoroState, now: number): number {
  return Math.max(0, state.plannedMs - getElapsedFocusMs(state, now));
}

export function isExpired(state: PomodoroState, now: number): boolean {
  if (state.status !== "RUNNING" && state.status !== "PAUSED") return false;
  if (state.startedAt === null) return false;
  return getRemainingMs(state, now) <= 0;
}

/** Restore helper: given a persisted state and now, report remaining + validity. */
export function restoreSession(state: PomodoroState, now: number): {
  remainingMs: number;
  elapsedFocusMs: number;
  pausedMs: number;
  active: boolean;
} {
  return {
    remainingMs: getRemainingMs(state, now),
    elapsedFocusMs: getElapsedFocusMs(state, now),
    pausedMs: getPausedMs(state, now),
    active: state.status === "RUNNING" || state.status === "PAUSED",
  };
}
