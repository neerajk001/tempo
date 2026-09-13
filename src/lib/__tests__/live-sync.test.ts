import { describe, it, expect } from "vitest";
import {
  liveFingerprint,
  shouldApplyLive,
  normalizeRemoteLive,
  type LiveBlob,
} from "@/lib/live-sync";
import type { PomodoroState } from "@/lib/pomodoro-machine";

function session(partial: Partial<PomodoroState> = {}): PomodoroState {
  return {
    status: "IDLE",
    phase: "FOCUS",
    startedAt: null,
    pausedAt: null,
    endedAt: null,
    totalPausedMs: 0,
    pauseCount: 0,
    plannedMs: 50 * 60 * 1000,
    completedFocusCount: 0,
    events: [],
    isInfinite: false,
    ...partial,
  };
}

function blob(partial: Partial<LiveBlob> = {}): LiveBlob {
  return {
    session: session(),
    activeTaskId: null,
    activeTaskTitle: null,
    quickLabel: null,
    breakOverride: null,
    focusMode: "allocated",
    sessionName: null,
    updatedAt: 0,
    ...partial,
  };
}

describe("liveFingerprint", () => {
  it("ignores the last-write-wins timestamp", () => {
    expect(liveFingerprint(blob({ updatedAt: 1 }))).toBe(
      liveFingerprint(blob({ updatedAt: 999 }))
    );
  });

  it("changes when the live session or pointer changes", () => {
    const a = blob();
    const paused = blob({ session: session({ status: "PAUSED", pausedAt: 5 }), updatedAt: 5 });
    const named = blob({ sessionName: "a project", focusMode: "infinite" });
    const linked = blob({ activeTaskId: "t1", activeTaskTitle: "a project" });
    expect(liveFingerprint(a)).not.toBe(liveFingerprint(paused));
    expect(liveFingerprint(a)).not.toBe(liveFingerprint(named));
    expect(liveFingerprint(a)).not.toBe(liveFingerprint(linked));
  });
});

describe("shouldApplyLive (last-write-wins)", () => {
  it("applies a strictly newer remote", () => {
    expect(shouldApplyLive(blob({ updatedAt: 1 }), blob({ updatedAt: 2 }))).toBe(true);
  });
  it("keeps local on ties or when local is newer", () => {
    expect(shouldApplyLive(blob({ updatedAt: 2 }), blob({ updatedAt: 2 }))).toBe(false);
    expect(shouldApplyLive(blob({ updatedAt: 3 }), blob({ updatedAt: 2 }))).toBe(false);
  });
});

describe("normalizeRemoteLive", () => {
  it("unwraps the server { state, updatedAt } envelope", () => {
    const remote = normalizeRemoteLive({
      state: {
        session: {
          status: "PAUSED",
          phase: "FOCUS",
          startedAt: 1000,
          pausedAt: 2000,
          plannedMs: 0,
          isInfinite: true,
          pauseCount: 2,
          events: [
            { type: "START", at: 1000 },
            { type: "PAUSE", at: 2000 },
          ],
        },
        activeTaskId: "t1",
        activeTaskTitle: "a project",
        sessionName: "a project",
        focusMode: "infinite",
      },
      updatedAt: 12345,
    });
    expect(remote?.session.status).toBe("PAUSED");
    expect(remote?.session.isInfinite).toBe(true);
    expect(remote?.session.pauseCount).toBe(2);
    expect(remote?.activeTaskId).toBe("t1");
    expect(remote?.sessionName).toBe("a project");
    expect(remote?.focusMode).toBe("infinite");
    expect(remote?.updatedAt).toBe(12345);
  });

  it("returns null for absent state", () => {
    expect(normalizeRemoteLive(null)).toBeNull();
    expect(normalizeRemoteLive(undefined)).toBeNull();
  });
});
