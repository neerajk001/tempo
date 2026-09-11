import { describe, it, expect } from "vitest";
import { mergeTasks, mergeSessions, normalizeRemoteTask, normalizeRemoteSession } from "@/lib/sync";
import type { Task } from "@/stores/task-store";
import type { SessionRecord } from "@/stores/session-history-store";

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: "Task",
    description: "",
    date: "2026-09-11",
    allocatedMinutes: 60,
    focusMinutes: 25,
    shortBreakMinutes: null,
    longBreakMinutes: null,
    longBreakInterval: null,
    status: "TODO",
    focusedMinutes: 0,
    completedPomodoros: 0,
    project: null,
    priority: "medium",
    calendarEventId: null,
    startMs: null,
    endMs: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...partial,
  };
}

function sess(partial: Partial<SessionRecord> & { id: string }): SessionRecord {
  return {
    taskId: null,
    taskTitle: null,
    phase: "FOCUS",
    status: "COMPLETED",
    plannedMs: 25 * 60000,
    startedAt: 2000,
    endedAt: 3000,
    focusedMs: 25 * 60000,
    pausedMs: 0,
    interruptions: 0,
    events: [],
    ...partial,
  };
}

describe("sync task merge", () => {
  it("unions disjoint local and remote tasks, newest first", () => {
    const { tasks, dropRemoteIds } = mergeTasks(
      [task({ id: "a", createdAt: 2000 })],
      [task({ id: "b", createdAt: 1000 })],
      new Set()
    );
    expect(tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(dropRemoteIds).toEqual([]);
  });

  it("last-write-wins on updatedAt", () => {
    const local = task({ id: "a", title: "Local newer", updatedAt: 5000 });
    const remote = task({ id: "a", title: "Remote older", updatedAt: 4000 });
    expect(mergeTasks([local], [remote], new Set()).tasks[0].title).toBe("Local newer");
    const flipped = mergeTasks(
      [{ ...local, updatedAt: 3000 }],
      [{ ...remote, updatedAt: 6000 }],
      new Set()
    );
    expect(flipped.tasks[0].title).toBe("Remote older");
  });

  it("tombstones beat both sides and surface remote drops", () => {
    const { tasks, dropRemoteIds } = mergeTasks(
      [task({ id: "gone-local" })],
      [task({ id: "gone-remote" })],
      new Set(["gone-local", "gone-remote"])
    );
    expect(tasks).toEqual([]);
    expect(dropRemoteIds).toEqual(["gone-remote"]);
  });

  it("collapses duplicate calendarEventIds, keeping the earliest", () => {
    const localRow = task({ id: "local-1", calendarEventId: "ev-1", createdAt: 2000, updatedAt: 2000 });
    const serverDupe = task({ id: "srv-9", calendarEventId: "ev-1", createdAt: 1000, updatedAt: 1000 });
    const { tasks, dropRemoteIds } = mergeTasks([localRow], [serverDupe], new Set());
    // Earliest createdAt wins regardless of side — the legacy server copy loses.
    expect(tasks.map((t) => t.id)).toEqual(["srv-9"]);
    expect(dropRemoteIds).toEqual([]);
  });

  it("keeps the local row on createdAt ties", () => {
    const localRow = task({ id: "local-1", calendarEventId: "ev-1", createdAt: 1000 });
    const serverDupe = task({ id: "srv-9", calendarEventId: "ev-1", createdAt: 1000 });
    const { tasks } = mergeTasks([localRow], [serverDupe], new Set());
    expect(tasks.map((t) => t.id)).toEqual(["local-1"]);
  });
});

describe("sync session merge", () => {
  it("unions and caps at 500, newest first", () => {
    const local = [sess({ id: "a", startedAt: 5000 })];
    const remote = [sess({ id: "b", startedAt: 1000 })];
    const { sessions } = mergeSessions(local, remote, new Set());
    expect(sessions.map((s) => s.id)).toEqual(["a", "b"]);
    const many = Array.from({ length: 600 }, (_, i) => sess({ id: `s${i}`, startedAt: i }));
    expect(mergeSessions(many, [], new Set()).sessions).toHaveLength(500);
  });

  it("tombstoned sessions never resurrect", () => {
    const { sessions, dropRemoteIds } = mergeSessions(
      [sess({ id: "dead" })],
      [sess({ id: "dead-remote" })],
      new Set(["dead", "dead-remote"])
    );
    expect(sessions).toEqual([]);
    expect(dropRemoteIds).toEqual(["dead-remote"]);
  });
});

describe("sync normalization", () => {
  it("rejects junk and fills task defaults", () => {
    expect(normalizeRemoteTask(null)).toBeNull();
    expect(normalizeRemoteTask({})).toBeNull();
    const t = normalizeRemoteTask({ id: "x", date: "not-a-date", priority: "bogus" });
    expect(t).toMatchObject({ id: "x", date: expect.any(String), priority: "medium", focusMinutes: 50 });
  });

  it("rejects junk sessions", () => {
    expect(normalizeRemoteSession(null)).toBeNull();
    expect(normalizeRemoteSession({ id: "x", status: "WEIRD", phase: "NAP" })).toMatchObject({
      id: "x",
      status: "COMPLETED",
      phase: "FOCUS",
    });
  });
});
