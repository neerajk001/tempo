import { describe, it, expect } from "vitest";
import { computeDashboardStats } from "@/lib/dashboard-stats";
import type { Task } from "@/stores/task-store";
import type { SessionRecord } from "@/stores/session-history-store";

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
// Sept 10 2026 local 09:00
const day = new Date(2026, 8, 10, 9, 0, 0).getTime();
const key = "2026-09-10";

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    description: "",
    date: key,
    allocatedMinutes: 60,
    focusMinutes: 50,
    status: "TODO",
    focusedMinutes: 0,
    completedPomodoros: 0,
    priority: "medium",
    createdAt: day,
    updatedAt: day,
    ...partial,
  };
}

function sess(partial: Partial<SessionRecord> & { id: string; startedAt: number }): SessionRecord {
  return {
    taskId: null,
    taskTitle: null,
    phase: "FOCUS",
    status: "COMPLETED",
    plannedMs: 50 * MIN,
    endedAt: partial.startedAt + 50 * MIN,
    focusedMs: 50 * MIN,
    pausedMs: 0,
    interruptions: 0,
    events: [],
    ...partial,
  };
}

describe("dashboard stats", () => {
  it("aggregates planned vs actual for today", () => {
    const tasks = [
      task({ id: "a", title: "AI Agent Project", allocatedMinutes: 360, focusedMinutes: 260 }),
      task({ id: "b", title: "Backend", allocatedMinutes: 180, focusedMinutes: 60 }),
    ];
    const sessions = [
      sess({ id: "s1", taskId: "a", taskTitle: "AI Agent Project", startedAt: day, focusedMs: 50 * MIN, interruptions: 1, pausedMs: 4 * MIN }),
      sess({ id: "s2", taskId: "a", taskTitle: "AI Agent Project", startedAt: day + H, focusedMs: 45 * MIN, interruptions: 2, pausedMs: 6 * MIN }),
      sess({ id: "s3", taskId: "b", taskTitle: "Backend", startedAt: day + 2 * H, focusedMs: 50 * MIN }),
    ];
    const s = computeDashboardStats(tasks, sessions, key);
    expect(s.plannedMinutes).toBe(540);
    expect(s.focusedMinutes).toBe(145); // 50+45+50
    expect(s.remainingMinutes).toBe(395);
    expect(s.completedPomodoros).toBe(3);
    expect(s.interruptions).toBe(3);
    expect(s.focusRate).toBe(Math.round((145 / 540) * 100));
    expect(s.perTask).toHaveLength(2);
    expect(s.perTask[0]).toMatchObject({ taskId: "a", actualMinutes: 95 });
    expect(s.timeline.map((t) => t.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("excludes breaks from focus totals but keeps them in timeline", () => {
    const tasks = [task({ id: "a", title: "AI", allocatedMinutes: 60 })];
    const sessions = [
      sess({ id: "f1", startedAt: day, focusedMs: 50 * MIN }),
      sess({ id: "b1", phase: "SHORT_BREAK", taskTitle: "Break", startedAt: day + H, plannedMs: 10 * MIN, endedAt: day + H + 10 * MIN, focusedMs: 10 * MIN }),
    ];
    const s = computeDashboardStats(tasks, sessions, key);
    expect(s.focusedMinutes).toBe(50);
    expect(s.timeline).toHaveLength(2);
  });

  it("falls back to task.focusedMinutes when no linked sessions exist", () => {
    const tasks = [task({ id: "a", title: "AI", allocatedMinutes: 120, focusedMinutes: 30 })];
    const s = computeDashboardStats(tasks, [], key);
    expect(s.focusedMinutes).toBe(0); // sessions are source of truth for totals
    expect(s.perTask[0].actualMinutes).toBe(30);
    expect(s.plannedMinutes).toBe(120);
  });

  it("handles empty state with zeros", () => {
    const s = computeDashboardStats([], [], key);
    expect(s).toMatchObject({
      plannedMinutes: 0,
      focusedMinutes: 0,
      remainingMinutes: 0,
      completedPomodoros: 0,
      interruptions: 0,
      focusRate: 0,
      sessionCount: 0,
    });
    expect(s.perTask).toEqual([]);
    expect(s.timeline).toEqual([]);
  });

  it("ignores sessions from other days", () => {
    const tasks = [task({ id: "a", title: "AI", allocatedMinutes: 60 })];
    const otherDay = new Date(2026, 8, 11, 9, 0, 0).getTime();
    const sessions = [sess({ id: "x", startedAt: otherDay, focusedMs: 50 * MIN })];
    const s = computeDashboardStats(tasks, sessions, key);
    expect(s.focusedMinutes).toBe(0);
    expect(s.timeline).toEqual([]);
  });

  it("counts allocation-free quick sessions as focus time, not as plan work", () => {
    const sessions = [
      sess({ id: "q1", taskId: null, taskTitle: "Deep Work Session", startedAt: day, focusedMs: 25 * MIN }),
    ];
    const s = computeDashboardStats([], sessions, key);
    expect(s.plannedMinutes).toBe(0);
    expect(s.focusedMinutes).toBe(25);
    expect(s.taskFocusedMinutes).toBe(0);
    expect(s.focusRate).toBe(100);
    expect(s.completedPomodoros).toBe(0);
  });

  it("does not let quick/unlinked focus consume the task plan", () => {
    const tasks = [task({ id: "a", title: "Agentic AI", allocatedMinutes: 120, focusMinutes: 25 })];
    const sessions = [
      sess({ id: "t1", taskId: "a", startedAt: day, plannedMs: 25 * MIN, focusedMs: 25 * MIN }),
      sess({ id: "t2", taskId: "a", startedAt: day + H, plannedMs: 25 * MIN, focusedMs: 25 * MIN }),
      sess({ id: "q1", taskId: null, taskTitle: "Deep Work Session", startedAt: day + 2 * H, plannedMs: 25 * MIN, focusedMs: 25 * MIN }),
    ];
    const s = computeDashboardStats(tasks, sessions, key);
    expect(s.plannedMinutes).toBe(120);
    expect(s.focusedMinutes).toBe(75); // all focus, incl. the quick block
    expect(s.taskFocusedMinutes).toBe(50); // only the two task blocks
    expect(s.remainingMinutes).toBe(70);
    expect(s.completedPomodoros).toBe(2);
    expect(s.focusRate).toBe(42); // 50/120
  });
});
