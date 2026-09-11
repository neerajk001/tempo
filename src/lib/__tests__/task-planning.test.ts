import { describe, it, expect } from "vitest";
import {
  calculatePomodoroPlan,
  countPlannedPomodoros,
  getTaskProgress,
  nextSliceMinutes,
} from "@/lib/task-planning";

describe("task pomodoro planning", () => {
  it("divides 360min by 50m into 7 full + 1 partial of 10", () => {
    const plan = calculatePomodoroPlan(360, 50);
    expect(plan).toHaveLength(8);
    expect(plan.slice(0, 7).every((p) => p.minutes === 50 && !p.isPartial)).toBe(true);
    expect(plan[7]).toEqual({ index: 8, minutes: 10, isPartial: true });
  });

  it("exact division has no partial session", () => {
    const plan = calculatePomodoroPlan(100, 50);
    expect(plan).toEqual([
      { index: 1, minutes: 50, isPartial: false },
      { index: 2, minutes: 50, isPartial: false },
    ]);
  });

  it("allocated smaller than focus gives single partial session", () => {
    const plan = calculatePomodoroPlan(20, 50);
    expect(plan).toEqual([{ index: 1, minutes: 20, isPartial: true }]);
  });

  it("rejects non-positive inputs", () => {
    expect(() => calculatePomodoroPlan(0, 50)).toThrow();
    expect(() => calculatePomodoroPlan(60, 0)).toThrow();
    expect(() => calculatePomodoroPlan(-10, 50)).toThrow();
  });

  it("computes remaining work and percent", () => {
    const p = getTaskProgress(360, 150, 50);
    expect(p.remainingMinutes).toBe(210);
    expect(p.percent).toBe(42); // 150/360
    expect(p.totalPomodoros).toBe(8);
    expect(p.completedPomodoros).toBe(3);
  });

  it("clamps over-completion to 100% and zero remaining", () => {
    const p = getTaskProgress(60, 90, 50);
    expect(p.remainingMinutes).toBe(0);
    expect(p.percent).toBe(100);
  });

  it("counts planned pomodoros", () => {
    expect(countPlannedPomodoros(360, 50)).toBe(8);
    expect(countPlannedPomodoros(50, 50)).toBe(1);
  });

  it("splits 60min by a custom 25m focus into focus blocks only (breaks never counted)", () => {
    const plan = calculatePomodoroPlan(60, 25);
    expect(plan).toEqual([
      { index: 1, minutes: 25, isPartial: false },
      { index: 2, minutes: 25, isPartial: false },
      { index: 3, minutes: 10, isPartial: true },
    ]);
    // Every planned minute is focus time; break cadence lives outside the plan.
    expect(plan.reduce((s, p) => s + p.minutes, 0)).toBe(60);
    expect(countPlannedPomodoros(60, 25)).toBe(3);
  });

  it("nextSliceMinutes returns the task's current block, not the workspace default", () => {
    // 120m allocated / 40m focus, 1 done -> second 40m block.
    expect(nextSliceMinutes(120, 40, 1)).toBe(40);
    // Fresh task starts at the first block.
    expect(nextSliceMinutes(120, 40, 0)).toBe(40);
    // Over-completion clamps to the final (partial) block, never past the end.
    expect(nextSliceMinutes(100, 40, 99)).toBe(20);
    // Invalid input falls back to a sane focus length.
    expect(nextSliceMinutes(0, 40, 0)).toBe(40);
    expect(nextSliceMinutes(60, 0, 0)).toBe(25);
  });
});
