import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "@/stores/task-store";
import { usePomodoroStore, taskBreaks, resolveBreaks } from "@/stores/pomodoro-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { usePrefsStore } from "@/stores/prefs-store";
import { createIdleState } from "@/lib/pomodoro-machine";
import { DEFAULT_POMODORO_CONFIG } from "@/lib/pomodoro-config";

const MIN = 60_000;

beforeEach(() => {
  useTaskStore.setState({ tasks: [], activeTaskId: null });
  usePomodoroStore.setState({
    session: createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG),
    config: DEFAULT_POMODORO_CONFIG,
    activeTaskId: null,
    activeTaskTitle: null,
    quickLabel: null,
    breakOverride: null,
    focusMode: "allocated",
    sessionName: null,
  });
  useSessionHistoryStore.setState({ sessions: [] });
});

describe("taskBreaks", () => {
  it("maps per-task minutes to a break override", () => {
    expect(taskBreaks({ shortBreakMinutes: 5, longBreakMinutes: 20, longBreakInterval: 3 })).toEqual({
      shortBreakMs: 5 * MIN,
      longBreakMs: 20 * MIN,
      longBreakInterval: 3,
    });
  });

  it("is null when the task has no overrides", () => {
    expect(
      taskBreaks({ shortBreakMinutes: null, longBreakMinutes: null, longBreakInterval: null })
    ).toBeNull();
  });
});

describe("break cadence follows the task", () => {
  it("uses the task's short break, not the workspace default", () => {
    // Workspace default is 10m; the task asks for 5m.
    expect(DEFAULT_POMODORO_CONFIG.shortBreakMs).toBe(10 * MIN);

    const task = useTaskStore.getState().createTask({
      title: "Agentic AI",
      allocatedMinutes: 145,
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 20,
      longBreakInterval: 3,
    });

    useTaskStore.getState().switchToTask(task.id);
    // The live session carries the task's cadence, not the workspace config.
    expect(usePomodoroStore.getState().breakOverride).toEqual({
      shortBreakMs: 5 * MIN,
      longBreakMs: 20 * MIN,
      longBreakInterval: 3,
    });

    usePomodoroStore.getState().complete();
    usePomodoroStore.getState().startBreak();

    const s = usePomodoroStore.getState().session;
    expect(s.phase).toBe("SHORT_BREAK");
    expect(s.plannedMs).toBe(5 * MIN);
  });

  it("resolves the override over the workspace config", () => {
    const eff = resolveBreaks(DEFAULT_POMODORO_CONFIG, taskBreaks({ shortBreakMinutes: 5 }));
    expect(eff.shortBreakMs).toBe(5 * MIN);
    expect(eff.longBreakMs).toBe(DEFAULT_POMODORO_CONFIG.longBreakMs);
  });
});

describe("manual break start", () => {
  it("does not auto-start breaks by default", () => {
    expect(usePrefsStore.getState().autoStartBreaks).toBe(false);
  });
});
