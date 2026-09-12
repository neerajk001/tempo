import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore, getFocusMode, getSessionLabel } from "@/stores/task-store";
import {
  usePomodoroStore,
  getInfiniteBreakRemaining,
  isInfiniteBreakComplete,
} from "@/stores/pomodoro-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { createIdleState, getRemainingMs, isExpired } from "@/lib/pomodoro-machine";
import { DEFAULT_POMODORO_CONFIG } from "@/lib/pomodoro-config";
import { computeDashboardStats } from "@/lib/dashboard-stats";

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
    infiniteBreak: null,
    infiniteBreakTotalMs: 0,
  });
  useSessionHistoryStore.setState({ sessions: [] });
});

function backdateSessionStart(ms: number) {
  const s = usePomodoroStore.getState().session;
  usePomodoroStore.setState({
    session: { ...s, startedAt: Date.now() - ms },
  });
}

describe("infinite focus mode", () => {
  it("creates an infinite task without an allocation and keeps a session name", () => {
    const t = useTaskStore.getState().createTask({
      title: "JavaScript Fundamentals",
      focusMode: "infinite",
      sessionName: "JavaScript Deep Dive",
      shortBreakMinutes: 10,
    });
    expect(t.allocatedMinutes).toBe(0);
    expect(getFocusMode(t)).toBe("infinite");
    expect(getSessionLabel(t)).toBe("JavaScript Deep Dive");
  });

  it("keeps allocated task creation unchanged (allocation required)", () => {
    expect(() =>
      useTaskStore.getState().createTask({ title: "Nope" } as never)
    ).toThrow();
    const t = useTaskStore.getState().createTask({ title: "API", allocatedMinutes: 180 });
    expect(getFocusMode(t)).toBe("allocated");
    expect(t.allocatedMinutes).toBe(180);
  });

  it("starts an open-ended session that never expires and shows no remaining", () => {
    const t = useTaskStore.getState().createTask({
      title: "Deep Dive",
      focusMode: "infinite",
      sessionName: "Backend Architecture",
    });
    useTaskStore.getState().switchToTask(t.id);
    const pomo = usePomodoroStore.getState();
    expect(pomo.session.status).toBe("RUNNING");
    expect(pomo.session.isInfinite).toBe(true);
    expect(pomo.focusMode).toBe("infinite");
    expect(pomo.sessionName).toBe("Backend Architecture");
    expect(pomo.session.plannedMs).toBe(0);
    // Far future: still not expired, remaining is unbounded.
    expect(isExpired(pomo.session, Date.now() + 8 * 60 * MIN)).toBe(false);
    expect(getRemainingMs(pomo.session, Date.now() + 8 * 60 * MIN)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it("pausing an infinite session starts a break countdown; resuming stops it", () => {
    const t = useTaskStore.getState().createTask({
      title: "Deep Dive",
      focusMode: "infinite",
      shortBreakMinutes: 10,
    });
    useTaskStore.getState().switchToTask(t.id);
    usePomodoroStore.getState().pause({ breakMs: 10 * MIN });
    let pomo = usePomodoroStore.getState();
    expect(pomo.session.status).toBe("PAUSED");
    expect(pomo.infiniteBreak).not.toBeNull();
    expect(pomo.infiniteBreak!.plannedMs).toBe(10 * MIN);
    const now = Date.now();
    expect(getInfiniteBreakRemaining(pomo.infiniteBreak, now)).toBeGreaterThan(0);
    expect(getInfiniteBreakRemaining(pomo.infiniteBreak, now)).toBeLessThanOrEqual(10 * MIN);
    expect(isInfiniteBreakComplete(pomo.infiniteBreak, now)).toBe(false);

    // Simulate 2 minutes of break, then resume before it finishes.
    usePomodoroStore.setState({
      infiniteBreak: { startedAt: Date.now() - 2 * MIN, plannedMs: 10 * MIN },
    });
    usePomodoroStore.getState().resume();
    pomo = usePomodoroStore.getState();
    expect(pomo.session.status).toBe("RUNNING");
    expect(pomo.infiniteBreak).toBeNull();
    expect(pomo.infiniteBreakTotalMs).toBeGreaterThan(0);
  });

  it("marks the break complete once the countdown elapses", () => {
    const brk = { startedAt: Date.now() - 11 * MIN, plannedMs: 10 * MIN };
    expect(isInfiniteBreakComplete(brk, Date.now())).toBe(true);
    expect(getInfiniteBreakRemaining(brk, Date.now())).toBe(0);
  });

  it("pausing an allocated session does not start break tracking", () => {
    const t = useTaskStore.getState().createTask({ title: "API", allocatedMinutes: 120 });
    useTaskStore.getState().switchToTask(t.id);
    usePomodoroStore.getState().pause();
    const pomo = usePomodoroStore.getState();
    expect(pomo.session.status).toBe("PAUSED");
    expect(pomo.focusMode).toBe("allocated");
    expect(pomo.infiniteBreak).toBeNull();
  });

  it("switching tasks preserves progress and keeps a single active timer", () => {
    const a = useTaskStore.getState().createTask({
      title: "JavaScript",
      focusMode: "infinite",
      sessionName: "JS Deep Dive",
    });
    const b = useTaskStore.getState().createTask({ title: "Build API", allocatedMinutes: 180 });

    useTaskStore.getState().switchToTask(a.id);
    backdateSessionStart(32 * MIN);

    // Switch to B: A is saved, its timer stops, B runs.
    useTaskStore.getState().switchToTask(b.id);
    const savedA = useTaskStore.getState().tasks.find((x) => x.id === a.id)!;
    expect(savedA.focusedMs).toBeGreaterThan(0);
    expect(usePomodoroStore.getState().activeTaskId).toBe(b.id);
    expect(usePomodoroStore.getState().session.status).toBe("RUNNING");

    const hist = useSessionHistoryStore.getState().sessions;
    expect(hist.length).toBeGreaterThanOrEqual(1);
    expect(hist[0].taskId).toBe(a.id);
    expect(hist[0].status).toBe("CANCELLED");

    // Only one live timer: starting B preempted A, exactly one RUNNING.
    const live = usePomodoroStore.getState();
    expect(live.session.status).toBe("RUNNING");
    expect(live.activeTaskId).toBe(b.id);

    // Return to A: previous totals are kept, timer resumes (never reset).
    const before = savedA.focusedMs!;
    backdateSessionStart(5 * MIN);
    useTaskStore.getState().switchToTask(a.id);
    const resumedA = useTaskStore.getState().tasks.find((x) => x.id === a.id)!;
    expect(resumedA.focusedMs!).toBeGreaterThanOrEqual(before);
    expect(usePomodoroStore.getState().activeTaskId).toBe(a.id);
    expect(usePomodoroStore.getState().focusMode).toBe("infinite");
  });

  it("allocated tasks resume their slice instead of restarting", () => {
    const a = useTaskStore.getState().createTask({
      title: "Big Build",
      allocatedMinutes: 360,
      focusMinutes: 50,
    });
    const b = useTaskStore.getState().createTask({ title: "Other", allocatedMinutes: 60 });

    useTaskStore.getState().switchToTask(a.id);
    const firstPlanned = usePomodoroStore.getState().session.plannedMs;
    expect(firstPlanned).toBe(50 * MIN);
    backdateSessionStart(12 * MIN);

    useTaskStore.getState().switchToTask(b.id);
    const savedA = useTaskStore.getState().tasks.find((x) => x.id === a.id)!;
    expect(savedA.focusedMs).toBeGreaterThan(0);
    // Partial slice does not complete a pomodoro.
    expect(savedA.completedPomodoros).toBe(0);
    // Cycle count + phase preserved for break-cadence resume.
    expect(savedA.completedFocusCount).toBeGreaterThanOrEqual(0);
    expect(savedA.lastPhase).toBe("FOCUS");

    useTaskStore.getState().switchToTask(a.id);
    const resumed = usePomodoroStore.getState();
    expect(resumed.session.plannedMs).toBe(50 * MIN);
    expect(resumed.focusMode).toBe("allocated");
  });

  it("dashboard totals combine allocated and infinite focus; infinite has no plan", () => {
    const day = "2026-09-10";
    const base = new Date(2026, 8, 10, 9, 0, 0).getTime();
    const inf = useTaskStore.getState().createTask({
      title: "JavaScript",
      date: day,
      focusMode: "infinite",
      sessionName: "JS Deep Dive",
    });
    const alloc = useTaskStore.getState().createTask({
      title: "Build API",
      date: day,
      allocatedMinutes: 180,
      focusMinutes: 50,
    });
    const tasks = useTaskStore.getState().tasks;
    const sessions = [
      {
        id: "s-inf",
        taskId: inf.id,
        taskTitle: inf.title,
        phase: "FOCUS" as const,
        status: "COMPLETED" as const,
        plannedMs: 0,
        startedAt: base,
        endedAt: base + 134 * MIN,
        focusedMs: 134 * MIN,
        pausedMs: 5 * MIN,
        interruptions: 1,
        events: [],
        sessionMode: "infinite" as const,
        sessionName: "JS Deep Dive",
        breakMs: 5 * MIN,
      },
      {
        id: "s-al",
        taskId: alloc.id,
        taskTitle: alloc.title,
        phase: "FOCUS" as const,
        status: "COMPLETED" as const,
        plannedMs: 50 * MIN,
        startedAt: base + 200 * MIN,
        endedAt: base + 250 * MIN,
        focusedMs: 50 * MIN,
        pausedMs: 0,
        interruptions: 0,
        events: [],
        sessionMode: "allocated" as const,
        sessionName: null,
        breakMs: 0,
      },
    ];
    const stats = computeDashboardStats(tasks, sessions, day);
    // 134m infinite + 50m allocated.
    expect(stats.focusedMinutes).toBe(184);
    // Only the allocated task contributes a plan.
    expect(stats.plannedMinutes).toBe(180);
    const perInf = stats.perTask.find((p) => p.taskId === inf.id)!;
    expect(perInf.focusMode).toBe("infinite");
    expect(perInf.sessionName).toBe("JS Deep Dive");
    expect(perInf.actualMinutes).toBe(134);
    expect(perInf.plannedMinutes).toBe(0);
    const entry = stats.timeline.find((t) => t.id === "s-inf")!;
    expect(entry.sessionMode).toBe("infinite");
    expect(entry.sessionName).toBe("JS Deep Dive");
    expect(entry.breakMs).toBe(5 * MIN);
  });
});
