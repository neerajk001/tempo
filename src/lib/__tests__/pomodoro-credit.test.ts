import { describe, it, expect } from "vitest";
import {
  clampCompletionEnd,
  completeSession,
  createIdleState,
  getCreditedFocusMs,
  startSession,
} from "@/lib/pomodoro-machine";
import { DEFAULT_POMODORO_CONFIG } from "@/lib/pomodoro-config";

const MIN = 60_000;

describe("allocated completion clamping", () => {
  it("caps credited focus at the planned duration after a sleep/offline gap", () => {
    const start = 1_000_000;
    const session = startSession(createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG), start);
    const wake = start + 8 * 60 * MIN;

    const completed = clampCompletionEnd(completeSession(session, wake));

    expect(completed.endedAt).toBe(start + session.plannedMs);
    expect(getCreditedFocusMs(completed, wake)).toBe(session.plannedMs);
  });

  it("does not credit overrun time to History/task totals", () => {
    const start = 2_000_000;
    const session = startSession(createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG), start);
    const at = start + session.plannedMs + 3 * 60 * MIN;

    const completed = clampCompletionEnd(completeSession(session, at));

    expect(getCreditedFocusMs(completed, at)).toBe(session.plannedMs);
    expect(completed.endedAt).toBe(start + session.plannedMs);
  });

  it("leaves an early completion untouched", () => {
    const start = 3_000_000;
    const session = startSession(createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG), start);
    const early = start + 10 * MIN;

    const completed = clampCompletionEnd(completeSession(session, early));

    expect(completed.endedAt).toBe(early);
    expect(getCreditedFocusMs(completed, early)).toBe(10 * MIN);
  });

  it("keeps infinite focus open-ended", () => {
    const start = 4_000_000;
    const session = startSession(createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG), start, {
      isInfinite: true,
      plannedMs: 0,
    });
    const at = start + 3 * 60 * MIN;

    const completed = clampCompletionEnd(completeSession(session, at));

    expect(completed.endedAt).toBe(at);
    expect(getCreditedFocusMs(completed, at)).toBe(3 * 60 * MIN);
  });
});
