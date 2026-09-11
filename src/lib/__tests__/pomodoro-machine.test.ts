import { describe, it, expect } from "vitest";
import {
  cancelSession,
  completeSession,
  createIdleState,
  getElapsedFocusMs,
  getPausedMs,
  getRemainingMs,
  InvalidPomodoroTransition,
  pauseSession,
  resumeSession,
  restoreSession,
  extendSession,
  startSession,
} from "@/lib/pomodoro-machine";
import { DEFAULT_POMODORO_CONFIG } from "@/lib/pomodoro-config";

const MIN = 60_000;

describe("pomodoro state machine", () => {
  it("starts from IDLE and sets startedAt", () => {
    const s0 = createIdleState("FOCUS");
    expect(s0.status).toBe("IDLE");
    const s1 = startSession(s0, 1_000);
    expect(s1.status).toBe("RUNNING");
    expect(s1.startedAt).toBe(1_000);
    expect(s1.events.map((e) => e.type)).toEqual(["START"]);
  });

  it("pauses and resumes, tracking paused time and count", () => {
    let s = startSession(createIdleState("FOCUS"), 0);
    s = pauseSession(s, 10 * MIN);
    expect(s.status).toBe("PAUSED");
    expect(s.pauseCount).toBe(1);
    expect(s.pausedAt).toBe(10 * MIN);

    s = resumeSession(s, 14 * MIN);
    expect(s.status).toBe("RUNNING");
    expect(s.pausedAt).toBeNull();
    expect(s.totalPausedMs).toBe(4 * MIN);

    // 14 min wall - 4 min paused = 10 min focus
    expect(getElapsedFocusMs(s, 14 * MIN)).toBe(10 * MIN);
    expect(getPausedMs(s, 14 * MIN)).toBe(4 * MIN);
  });

  it("handles multiple pauses correctly", () => {
    let s = startSession(createIdleState("FOCUS"), 0);
    s = pauseSession(s, 23 * MIN);
    s = resumeSession(s, 27 * MIN); // +4 paused
    s = pauseSession(s, 30 * MIN);
    s = resumeSession(s, 33 * MIN); // +3 paused
    s = pauseSession(s, 40 * MIN);
    s = resumeSession(s, 42 * MIN); // +2 paused

    expect(s.pauseCount).toBe(3);
    expect(s.totalPausedMs).toBe(9 * MIN);
    // wall 42 - paused 9 = 33 focus
    expect(getElapsedFocusMs(s, 42 * MIN)).toBe(33 * MIN);
  });

  it("completes after pause and folds open pause into totals", () => {
    let s = startSession(createIdleState("FOCUS"), 0);
    s = pauseSession(s, 20 * MIN);
    s = completeSession(s, 25 * MIN); // 5 min paused while paused
    expect(s.status).toBe("COMPLETED");
    expect(s.endedAt).toBe(25 * MIN);
    expect(s.totalPausedMs).toBe(5 * MIN);
    expect(getElapsedFocusMs(s, 99 * MIN)).toBe(20 * MIN); // frozen at end
    expect(s.completedFocusCount).toBe(1);
  });

  it("cancels a running session", () => {
    let s = startSession(createIdleState("FOCUS"), 0);
    s = cancelSession(s, 5 * MIN);
    expect(s.status).toBe("CANCELLED");
    expect(getElapsedFocusMs(s, 5 * MIN)).toBe(5 * MIN);
  });

  it("pause immediately after start works (edge case)", () => {
    let s = startSession(createIdleState("FOCUS"), 1_000);
    s = pauseSession(s, 1_001);
    expect(s.pauseCount).toBe(1);
    expect(getElapsedFocusMs(s, 1_001)).toBe(1);
  });

  it("remaining time derives from timestamps", () => {
    const s = startSession(createIdleState("FOCUS"), 0, {
      plannedMs: 50 * MIN,
    });
    expect(getRemainingMs(s, 3 * MIN)).toBe(47 * MIN);
  });

  it("rejects invalid transitions", () => {
    const idle = createIdleState("FOCUS");
    expect(() => pauseSession(idle, 0)).toThrow(InvalidPomodoroTransition);
    expect(() => resumeSession(idle, 0)).toThrow(InvalidPomodoroTransition);
    expect(() => completeSession(idle, 0)).toThrow(InvalidPomodoroTransition);
    expect(() => cancelSession(idle, 0)).toThrow(InvalidPomodoroTransition);

    const running = startSession(idle, 0);
    expect(() => startSession(running, 1)).toThrow(InvalidPomodoroTransition);
    expect(() => resumeSession(running, 1)).toThrow(InvalidPomodoroTransition);

    const paused = pauseSession(running, 2);
    expect(() => pauseSession(paused, 3)).toThrow(InvalidPomodoroTransition);
    expect(() => startSession(paused, 3)).toThrow(InvalidPomodoroTransition);
  });

  it("uses default 50m focus plan", () => {
    const s = createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG);
    expect(s.plannedMs).toBe(50 * MIN);
  });

  it("restores a running session after refresh from timestamps alone", () => {
    // Simulate persist -> reload: only timestamps survive, no tick state.
    const live = startSession(createIdleState("FOCUS"), 0, { plannedMs: 50 * MIN });
    const reloaded = JSON.parse(JSON.stringify(live));
    const restored = restoreSession(reloaded, 47 * MIN);
    expect(restored.active).toBe(true);
    expect(restored.remainingMs).toBe(3 * MIN);
    expect(restored.elapsedFocusMs).toBe(47 * MIN);
  });

  it("restores a paused session without time drift while hidden", () => {
    let s = startSession(createIdleState("FOCUS"), 0, { plannedMs: 50 * MIN });
    s = pauseSession(s, 20 * MIN);
    // Hours pass while the tab is closed: paused time absorbs all of it.
    const reloaded = JSON.parse(JSON.stringify(s));
    const restored = restoreSession(reloaded, 5 * 60 * MIN);
    expect(restored.active).toBe(true);
    expect(restored.elapsedFocusMs).toBe(20 * MIN);
    expect(restored.remainingMs).toBe(30 * MIN);
  });

  it("freezes terminal sessions so reopen never corrupts history", () => {
    let s = startSession(createIdleState("FOCUS"), 0, { plannedMs: 50 * MIN });
    s = completeSession(s, 50 * MIN);
    const reloaded = JSON.parse(JSON.stringify(s));
    expect(restoreSession(reloaded, 500 * MIN).elapsedFocusMs).toBe(50 * MIN);
    expect(restoreSession(reloaded, 500 * MIN).active).toBe(false);
  });

  it("extends a live session without touching timestamps", () => {
    let s = startSession(createIdleState("FOCUS"), 0, { plannedMs: 50 * MIN });
    s = extendSession(s, 5 * MIN);
    expect(s.plannedMs).toBe(55 * MIN);
    expect(s.startedAt).toBe(0);
    expect(getRemainingMs(s, 50 * MIN)).toBe(5 * MIN);
    expect(() => extendSession(createIdleState("FOCUS"), 5 * MIN)).toThrow(InvalidPomodoroTransition);
  });
});
