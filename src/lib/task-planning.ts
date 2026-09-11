export interface PlannedPomodoro {
  index: number; // 1-based
  minutes: number;
  /** true when this is a final shorter session (< focusMinutes) */
  isPartial: boolean;
}

export interface TaskProgress {
  allocatedMinutes: number;
  focusedMinutes: number;
  remainingMinutes: number;
  percent: number; // 0-100 clamped
  completedPomodoros: number;
  totalPomodoros: number;
}

/**
 * Divide allocated work into focus sessions.
 *
 * Strategy (documented, consistent):
 * - Fill with full `focusMinutes` sessions.
 * - If a remainder > 0 exists, append ONE final shorter session with exactly
 *   the remainder minutes (minimum 1 minute).
 * - If allocated <= focus, single session (partial when allocated < focus).
 *
 * Example: 360 allocated / 50 focus ->
 *   50,50,50,50,50,50,50,10  (7 full + 1 partial of 10)
 */
export function calculatePomodoroPlan(
  allocatedMinutes: number,
  focusMinutes: number
): PlannedPomodoro[] {
  if (!Number.isFinite(allocatedMinutes) || allocatedMinutes <= 0) {
    throw new Error("allocatedMinutes must be a positive number");
  }
  if (!Number.isFinite(focusMinutes) || focusMinutes <= 0) {
    throw new Error("focusMinutes must be a positive number");
  }
  const allocated = Math.round(allocatedMinutes);
  const focus = Math.round(focusMinutes);

  const full = Math.floor(allocated / focus);
  const remainder = allocated - full * focus;

  const plan: PlannedPomodoro[] = [];
  for (let i = 0; i < full; i++) {
    plan.push({ index: i + 1, minutes: focus, isPartial: false });
  }
  if (remainder > 0) {
    plan.push({ index: full + 1, minutes: remainder, isPartial: true });
  }
  // Edge: allocated < focus -> full=0, remainder=allocated -> single partial
  return plan;
}

export function countPlannedPomodoros(allocatedMinutes: number, focusMinutes: number): number {
  return calculatePomodoroPlan(allocatedMinutes, focusMinutes).length;
}

/**
 * Minutes for a task's next focus run: its current plan block given how
 * many pomodoros are already done (clamped into range). This is what the
 * timer must count down — never the workspace default.
 */
export function nextSliceMinutes(
  allocatedMinutes: number,
  focusMinutes: number,
  completedPomodoros: number
): number {
  const fallback = Math.max(1, Math.round(focusMinutes) || 25);
  try {
    const plan = calculatePomodoroPlan(allocatedMinutes, focusMinutes);
    if (plan.length === 0) return fallback;
    const idx = Math.min(Math.max(Math.floor(completedPomodoros) || 0, 0), plan.length - 1);
    return Math.max(1, plan[idx].minutes);
  } catch {
    return fallback;
  }
}

export function getTaskProgress(
  allocatedMinutes: number,
  focusedMinutes: number,
  focusMinutes: number
): TaskProgress {
  const allocated = Math.max(0, Math.round(allocatedMinutes));
  const focused = Math.max(0, Math.round(focusedMinutes));
  const remaining = Math.max(0, allocated - focused);
  const percent = allocated === 0 ? 0 : Math.min(100, Math.round((focused / allocated) * 100));
  const totalPomodoros = allocated === 0 ? 0 : countPlannedPomodoros(allocated, focusMinutes);
  const completedPomodoros =
    focusMinutes > 0 ? Math.floor(focused / Math.round(focusMinutes)) : 0;
  return {
    allocatedMinutes: allocated,
    focusedMinutes: focused,
    remainingMinutes: remaining,
    percent,
    completedPomodoros,
    totalPomodoros,
  };
}

/** Today's date key in local timezone: YYYY-MM-DD */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
