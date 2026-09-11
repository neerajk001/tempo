import { describe, it, expect } from "vitest";
import { clampTimerOffset, clockAngles, stepTimerScale } from "@/components/pomodoro/FocusTimer";

const MIN = 60000;

describe("analog clock angles", () => {
  it("starts at zero with zero progress", () => {
    expect(clockAngles(0, 50 * MIN)).toEqual({ pct: 0, minute: 0, second: 0 });
  });

  it("sweeps a full minute-hand turn per session", () => {
    expect(clockAngles(25 * MIN, 50 * MIN).pct).toBe(50);
    expect(clockAngles(25 * MIN, 50 * MIN).minute).toBe(180);
  });

  it("never spins backwards across the 12 (monotonic angles)", () => {
    const a = clockAngles(60 * 1000, 50 * MIN);
    const b = clockAngles(61 * 1000, 50 * MIN);
    expect(a.second).toBe(360);
    expect(b.second).toBe(366);
    expect(b.second).toBeGreaterThan(a.second);
    expect(b.minute).toBeGreaterThan(a.minute);
  });

  it("clamps progress but keeps sweeping on overrun", () => {
    const c = clockAngles(100 * MIN, 50 * MIN);
    expect(c.pct).toBe(100);
    expect(c.minute).toBe(720);
  });

  it("handles zero planned time without NaN", () => {
    const c = clockAngles(5000, 0);
    expect(c.pct).toBe(0);
    expect(Number.isFinite(c.minute)).toBe(true);
    expect(Number.isFinite(c.second)).toBe(true);
  });
});

describe("floating timer scale", () => {
  it("steps symmetrically and clamps to min/max", () => {
    expect(stepTimerScale(1, 1)).toBe(1.15);
    expect(stepTimerScale(1, -1)).toBe(0.85);
    expect(stepTimerScale(1.6, 1)).toBe(1.6);
    expect(stepTimerScale(0.6, -1)).toBe(0.6);
  });

  it("avoids float dust", () => {
    expect(stepTimerScale(0.85, 1)).toBe(1);
    expect(stepTimerScale(1.15, -1)).toBe(1);
  });
});

describe("floating timer clamp", () => {
  it("keeps the center as-is", () => {
    expect(clampTimerOffset(0, 0, 1, 1280, 800)).toEqual({ x: 0, y: 0 });
  });

  it("clamps wild offsets inside the viewport with margins", () => {
    const c = clampTimerOffset(5000, -5000, 1, 1280, 800);
    expect(c.x).toBeLessThanOrEqual(1280 / 2 - 210 - 12);
    expect(c.y).toBeGreaterThanOrEqual(-(800 / 2 - 210 - 64));
    // Top margin reserves room for the toolbar, bottom does not.
    expect(Math.abs(c.y)).toBeGreaterThan(Math.abs(800 / 2 - 210 - 12) - 100);
  });

  it("centers when the viewport is smaller than the timer", () => {
    expect(clampTimerOffset(40, -30, 1.6, 200, 200)).toEqual({ x: 0, y: 0 });
  });

  it("treats non-finite input as centered", () => {
    expect(clampTimerOffset(NaN, Infinity, 1, 1280, 800)).toEqual({ x: 0, y: 0 });
  });
});
