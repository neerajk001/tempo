import { describe, it, expect } from "vitest";
import { clockAngles } from "@/components/pomodoro/FocusTimer";

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
