import { describe, it, expect } from "vitest";
import {
  calculateCompletionRate,
  calculateFocusDuration,
  calculateInterruptions,
  calculatePausedDuration,
  summarizeSession,
} from "@/lib/session-analytics";

const MIN = 60_000;

function ev(type: "START" | "PAUSE" | "RESUME" | "COMPLETE" | "CANCEL", atMin: number) {
  return { type, timestamp: atMin * MIN } as const;
}

describe("session analytics", () => {
  it("counts every pause as an interruption", () => {
    const events = [ev("START", 0), ev("PAUSE", 23), ev("RESUME", 27), ev("COMPLETE", 50)];
    expect(calculateInterruptions(events)).toBe(1);
  });

  it("computes focus 50m / paused 4m for single interruption example", () => {
    // START 0, focus 23, pause 4, focus 27 -> wall 54, focus 50, paused 4
    const events = [ev("START", 0), ev("PAUSE", 23), ev("RESUME", 27), ev("COMPLETE", 54)];
    expect(calculatePausedDuration(events)).toBe(4 * MIN);
    expect(calculateFocusDuration(events)).toBe(50 * MIN);
  });

  it("handles multiple interruptions", () => {
    const events = [
      ev("START", 0),
      ev("PAUSE", 10),
      ev("RESUME", 14), // +4
      ev("PAUSE", 20),
      ev("RESUME", 23), // +3
      ev("PAUSE", 30),
      ev("RESUME", 32), // +2
      ev("COMPLETE", 50),
    ];
    expect(calculateInterruptions(events)).toBe(3);
    expect(calculatePausedDuration(events)).toBe(9 * MIN);
    // wall 50 - paused 9 = 41 focus
    expect(calculateFocusDuration(events)).toBe(41 * MIN);
  });

  it("counts open pause until end", () => {
    const events = [ev("START", 0), ev("PAUSE", 20)];
    // still paused at 25
    expect(calculatePausedDuration(events, 25 * MIN)).toBe(5 * MIN);
    expect(calculateFocusDuration(events, 25 * MIN)).toBe(20 * MIN);
  });

  it("completing from paused folds open pause in", () => {
    const events = [ev("START", 0), ev("PAUSE", 20), ev("COMPLETE", 25)];
    expect(calculatePausedDuration(events)).toBe(5 * MIN);
    expect(calculateFocusDuration(events)).toBe(20 * MIN);
  });

  it("returns 0 focus without START", () => {
    expect(calculateFocusDuration([])).toBe(0);
    expect(calculatePausedDuration([])).toBe(0);
    expect(calculateInterruptions([])).toBe(0);
  });

  it("calculates completion rate clamped to 100", () => {
    expect(calculateCompletionRate(50 * MIN, 50 * MIN)).toBe(100);
    expect(calculateCompletionRate(50 * MIN, 25 * MIN)).toBe(50);
    expect(calculateCompletionRate(50 * MIN, 99 * MIN)).toBe(100);
    expect(calculateCompletionRate(0, 10)).toBe(0);
  });

  it("summarizes a full session", () => {
    const s = summarizeSession({
      events: [ev("START", 0), ev("PAUSE", 23), ev("RESUME", 27), ev("COMPLETE", 54)],
      plannedMs: 50 * MIN,
    });
    expect(s).toMatchObject({
      focusedMs: 50 * MIN,
      pausedMs: 4 * MIN,
      interruptions: 1,
      completionRate: 100,
      startedAt: 0,
      endedAt: 54 * MIN,
    });
  });

  it("handles crossing midnight (timestamps are absolute)", () => {
    const day = 24 * 60 * MIN;
    const events = [
      { type: "START" as const, timestamp: day - 10 * MIN },
      { type: "COMPLETE" as const, timestamp: day + 40 * MIN },
    ];
    expect(calculateFocusDuration(events)).toBe(50 * MIN);
  });
});
