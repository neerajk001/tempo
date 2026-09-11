import { describe, it, expect, beforeEach } from "vitest";
import { usePomodoroStore, resolveBreaks } from "@/stores/pomodoro-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { createIdleState } from "@/lib/pomodoro-machine";
import { DEFAULT_POMODORO_CONFIG } from "@/lib/pomodoro-config";

beforeEach(() => {
  usePomodoroStore.setState({
    session: createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG),
    config: DEFAULT_POMODORO_CONFIG,
    activeTaskId: null,
    activeTaskTitle: null,
    breakOverride: null,
  });
  useSessionHistoryStore.setState({ sessions: [] });
});

describe("single-active pomodoro invariant", () => {
  it("starting a second session stops the first (logged as cancelled)", () => {
    const pomo = usePomodoroStore.getState();
    pomo.startForTask("task-a", "Task A");
    const firstStart = usePomodoroStore.getState().session.startedAt;
    expect(usePomodoroStore.getState().session.status).toBe("RUNNING");

    usePomodoroStore.getState().startForTask("task-b", "Task B");

    const s = usePomodoroStore.getState();
    expect(s.session.status).toBe("RUNNING");
    expect(s.activeTaskId).toBe("task-b");
    expect(s.session.startedAt).toBeGreaterThanOrEqual(firstStart!);

    const hist = useSessionHistoryStore.getState().sessions;
    expect(hist).toHaveLength(1);
    expect(hist[0].status).toBe("CANCELLED");
    expect(hist[0].taskId).toBe("task-a");
  });

  it("startBreak preempts a running focus session", () => {
    usePomodoroStore.getState().start("FOCUS");
    expect(usePomodoroStore.getState().session.status).toBe("RUNNING");

    usePomodoroStore.getState().startBreak();

    const s = usePomodoroStore.getState();
    expect(s.session.status).toBe("RUNNING");
    expect(s.session.phase === "SHORT_BREAK" || s.session.phase === "LONG_BREAK").toBe(true);
    const hist = useSessionHistoryStore.getState().sessions;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ status: "CANCELLED", phase: "FOCUS" });
  });

  it("starting from idle logs nothing spurious", () => {
    usePomodoroStore.getState().start("FOCUS");
    expect(usePomodoroStore.getState().session.status).toBe("RUNNING");
    expect(useSessionHistoryStore.getState().sessions).toHaveLength(0);
  });

  it("pausing then starting elsewhere still yields exactly one active timer", () => {
    const pomo = usePomodoroStore.getState();
    pomo.startForTask("task-a", "Task A");
    pomo.pause();
    expect(usePomodoroStore.getState().session.status).toBe("PAUSED");

    usePomodoroStore.getState().startForTask("task-b", "Task B");
    expect(usePomodoroStore.getState().session.status).toBe("RUNNING");
    const hist = useSessionHistoryStore.getState().sessions;
    expect(hist).toHaveLength(1);
    expect(hist[0].status).toBe("CANCELLED");
  });

  it("startQuick runs allocation-free with label + custom duration", () => {
    usePomodoroStore.getState().startQuick("Read paper", 25 * 60000);
    const s = usePomodoroStore.getState();
    expect(s.session.status).toBe("RUNNING");
    expect(s.activeTaskId).toBeNull();
    expect(s.activeTaskTitle).toBe("Read paper");
    expect(s.session.plannedMs).toBe(25 * 60000);
  });

  it("startQuick falls back to defaults on empty input", () => {
    usePomodoroStore.getState().startQuick();
    const s = usePomodoroStore.getState();
    expect(s.session.status).toBe("RUNNING");
    expect(s.activeTaskId).toBeNull();
    expect(s.activeTaskTitle).toBe("Deep Work Session");
  });

  it("startQuick stores a normalized break override", () => {
    usePomodoroStore.getState().startQuick("Quick", 25 * 60000, {
      shortBreakMs: 3 * 60000,
      longBreakMs: 20 * 60000,
      longBreakInterval: 2,
    });
    expect(usePomodoroStore.getState().breakOverride).toEqual({
      shortBreakMs: 3 * 60000,
      longBreakMs: 20 * 60000,
      longBreakInterval: 2,
    });
  });

  it("startQuick without breaks leaves the override empty (follows Settings)", () => {
    usePomodoroStore.getState().startQuick("Quick", 25 * 60000);
    expect(usePomodoroStore.getState().breakOverride).toBeNull();
    const { config, breakOverride } = usePomodoroStore.getState();
    expect(resolveBreaks(config, breakOverride)).toEqual({
      shortBreakMs: DEFAULT_POMODORO_CONFIG.shortBreakMs,
      longBreakMs: DEFAULT_POMODORO_CONFIG.longBreakMs,
      longBreakInterval: DEFAULT_POMODORO_CONFIG.longBreakInterval,
    });
  });

  it("startForTask clears a quick break override", () => {
    usePomodoroStore.getState().startQuick("Quick", 25 * 60000, {
      shortBreakMs: 3 * 60000,
    });
    expect(usePomodoroStore.getState().breakOverride).not.toBeNull();
    usePomodoroStore.getState().startForTask("task-a", "Task A");
    expect(usePomodoroStore.getState().breakOverride).toBeNull();
  });

  it("a global cadence edit clears the quick override, other edits keep it", () => {
    usePomodoroStore.getState().startQuick("Quick", 25 * 60000, {
      shortBreakMs: 3 * 60000,
    });
    usePomodoroStore.getState().setConfig({ focusMs: 25 * 60000 });
    expect(usePomodoroStore.getState().breakOverride).not.toBeNull();
    usePomodoroStore.getState().setConfig({ shortBreakMs: 15 * 60000 });
    expect(usePomodoroStore.getState().breakOverride).toBeNull();
  });

  it("startBreak honors the quick override for length and long-break timing", () => {
    usePomodoroStore.getState().startQuick("Quick", 25 * 60000, {
      shortBreakMs: 5 * 60000,
      longBreakMs: 30 * 60000,
      longBreakInterval: 2,
    });
    // 1 completed focus with interval 2 -> short break of 5m.
    usePomodoroStore.setState({
      session: {
        ...usePomodoroStore.getState().session,
        status: "COMPLETED",
        phase: "FOCUS",
        completedFocusCount: 1,
      },
    });
    usePomodoroStore.getState().startBreak();
    let s = usePomodoroStore.getState();
    expect(s.session.phase).toBe("SHORT_BREAK");
    expect(s.session.plannedMs).toBe(5 * 60000);

    // 2 completed focuses with interval 2 -> long break of 30m.
    usePomodoroStore.setState({
      session: {
        ...usePomodoroStore.getState().session,
        status: "COMPLETED",
        phase: "FOCUS",
        completedFocusCount: 2,
      },
    });
    usePomodoroStore.getState().startBreak();
    s = usePomodoroStore.getState();
    expect(s.session.phase).toBe("LONG_BREAK");
    expect(s.session.plannedMs).toBe(30 * 60000);
  });
});
