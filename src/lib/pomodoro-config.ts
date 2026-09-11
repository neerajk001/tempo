import type { PomodoroPhase } from "@/types";

export interface PomodoroConfig {
  /** milliseconds */
  focusMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  longBreakInterval: number;
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusMs: 50 * 60 * 1000,
  shortBreakMs: 10 * 60 * 1000,
  longBreakMs: 30 * 60 * 1000,
  longBreakInterval: 4,
};

export function getPlannedMsForPhase(
  phase: PomodoroPhase,
  config: PomodoroConfig = DEFAULT_POMODORO_CONFIG
): number {
  switch (phase) {
    case "FOCUS":
      return config.focusMs;
    case "SHORT_BREAK":
      return config.shortBreakMs;
    case "LONG_BREAK":
      return config.longBreakMs;
  }
}

/**
 * After a FOCUS session completes, decide which break comes next.
 * Every `longBreakInterval`-th focus session triggers a long break.
 */
export function getBreakPhaseAfterFocus(
  completedFocusCount: number,
  config: PomodoroConfig = DEFAULT_POMODORO_CONFIG
): PomodoroPhase {
  if (completedFocusCount > 0 && completedFocusCount % config.longBreakInterval === 0) {
    return "LONG_BREAK";
  }
  return "SHORT_BREAK";
}
