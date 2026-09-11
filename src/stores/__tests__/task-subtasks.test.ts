import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "@/stores/task-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { createIdleState } from "@/lib/pomodoro-machine";
import { DEFAULT_POMODORO_CONFIG } from "@/lib/pomodoro-config";

beforeEach(() => {
  useTaskStore.setState({ tasks: [], activeTaskId: null });
  usePomodoroStore.setState({
    session: createIdleState("FOCUS", DEFAULT_POMODORO_CONFIG),
    activeTaskId: null,
    activeTaskTitle: null,
  });
  useSessionHistoryStore.setState({ sessions: [] });
});

describe("task subtasks", () => {
  it("adds, toggles, and removes subtasks", () => {
    const store = useTaskStore.getState();
    const task = store.createTask({ title: "Build", allocatedMinutes: 60 });
    expect(task.subtasks).toEqual([]);

    const sub = useTaskStore.getState().addSubtask(task.id, "Scaffold engine");
    expect(sub.done).toBe(false);

    useTaskStore.getState().toggleSubtask(task.id, sub.id);
    expect(useTaskStore.getState().tasks[0].subtasks?.[0].done).toBe(true);

    useTaskStore.getState().removeSubtask(task.id, sub.id);
    expect(useTaskStore.getState().tasks[0].subtasks).toEqual([]);
  });

  it("rejects blank subtask titles", () => {
    const task = useTaskStore.getState().createTask({ title: "Build", allocatedMinutes: 60 });
    expect(() => useTaskStore.getState().addSubtask(task.id, "   ")).toThrow();
  });

  it("stores project and priority", () => {
    const task = useTaskStore
      .getState()
      .createTask({ title: "Build", allocatedMinutes: 60, project: "Core Platform", priority: "urgent" });
    expect(task.project).toBe("Core Platform");
    expect(task.priority).toBe("urgent");
    useTaskStore.getState().updateTask(task.id, { priority: "low" });
    expect(useTaskStore.getState().tasks[0].priority).toBe("low");
  });

  it("stores per-task break cadence with workspace defaults as fallback", () => {
    const def = useTaskStore.getState().createTask({ title: "Default cadence", allocatedMinutes: 60 });
    expect(def.shortBreakMinutes).toBeNull();
    expect(def.longBreakMinutes).toBeNull();
    expect(def.longBreakInterval).toBeNull();

    const custom = useTaskStore.getState().createTask({
      title: "Custom cadence",
      allocatedMinutes: 360,
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 20,
      longBreakInterval: 3,
    });
    expect(custom.shortBreakMinutes).toBe(5);
    expect(custom.longBreakMinutes).toBe(20);
    expect(custom.longBreakInterval).toBe(3);

    useTaskStore.getState().updateTask(custom.id, { shortBreakMinutes: 15 });
    expect(useTaskStore.getState().tasks.find((t) => t.id === custom.id)?.shortBreakMinutes).toBe(15);
    expect(() => useTaskStore.getState().createTask({ title: "Bad", allocatedMinutes: 60, shortBreakMinutes: 61 })).toThrow();
  });
});

describe("task deletion with a live timer", () => {
  it("stops the timer, clears the dashboard link, and logs partial work", () => {
    const task = useTaskStore.getState().createTask({ title: "Doomed", allocatedMinutes: 60 });
    usePomodoroStore.getState().startForTask(task.id, task.title);
    expect(usePomodoroStore.getState().session.status).toBe("RUNNING");

    useTaskStore.getState().removeTask(task.id);

    const pomo = usePomodoroStore.getState();
    expect(pomo.session.status).toBe("CANCELLED");
    expect(pomo.activeTaskId).toBeNull();
    expect(pomo.activeTaskTitle).toBeNull();
    expect(useTaskStore.getState().tasks).toHaveLength(0);
    const hist = useSessionHistoryStore.getState().sessions;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ status: "CANCELLED", taskId: task.id });
  });

  it("deleting an unrelated task leaves the live timer alone", () => {
    const live = useTaskStore.getState().createTask({ title: "Live", allocatedMinutes: 60 });
    const other = useTaskStore.getState().createTask({ title: "Other", allocatedMinutes: 30 });
    usePomodoroStore.getState().startForTask(live.id, live.title);

    useTaskStore.getState().removeTask(other.id);

    expect(usePomodoroStore.getState().session.status).toBe("RUNNING");
    expect(usePomodoroStore.getState().activeTaskId).toBe(live.id);
    expect(useSessionHistoryStore.getState().sessions).toHaveLength(0);
  });
});
