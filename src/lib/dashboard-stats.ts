import type { FocusMode } from "@/types";
import { getFocusMode, type Task } from "@/stores/task-store";
import { getRecordLabel, getSessionMode, type SessionRecord } from "@/stores/session-history-store";

export interface PerTaskStat {
  taskId: string;
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
  remainingMinutes: number;
  percent: number;
  focusMode: FocusMode;
  sessionName: string | null;
}

export interface TimelineEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  title: string;
  phase: SessionRecord["phase"];
  status: SessionRecord["status"];
  focusedMs: number;
  breakMs: number;
  interruptions: number;
  sessionMode: FocusMode;
  sessionName: string | null;
}

export interface DashboardStats {
  dateKey: string;
  plannedMinutes: number;
  /** All focus logged today (task + quick/unlinked). */
  focusedMinutes: number;
  /** Focus credited to today's allocated tasks (the plan). */
  taskFocusedMinutes: number;
  remainingMinutes: number;
  completedPomodoros: number;
  interruptions: number;
  pausedMs: number;
  avgInterruptions: number;
  focusRate: number;
  sessionCount: number;
  perTask: PerTaskStat[];
  timeline: TimelineEntry[];
}

export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isFocus(s: SessionRecord): boolean {
  return s.phase === "FOCUS";
}

/**
 * Aggregate today's planned vs actual work.
 * - Planned: sum of allocated minutes for ALLOCATED tasks dated `dateKey`
 *   (Infinite tasks are open-ended and contribute no plan).
 * - Focused: sum of focusedMs from today's FOCUS sessions (all statuses;
 *   cancelled sessions still contributed real focus) — Allocated + Infinite,
 *   including quick/unlinked sessions. Breaks excluded.
 * - Plan progress (Remaining, Focus Rate, Pomodoros) counts only focus
 *   credited to today's ALLOCATED tasks, so quick/unlinked sessions never
 *   consume the plan and the three cards agree.
 */
export function computeDashboardStats(
  tasks: Task[],
  sessions: SessionRecord[],
  dateKey: string
): DashboardStats {
  const todayTasks = tasks.filter((t) => t.date === dateKey);
  const todaySessions = sessions
    .filter((s) => localDateKey(s.startedAt) === dateKey)
    .sort((a, b) => a.startedAt - b.startedAt);

  const focusSessions = todaySessions.filter(isFocus);

  const plannedMinutes = todayTasks.reduce(
    (sum, t) => sum + (getFocusMode(t) === "infinite" ? 0 : t.allocatedMinutes),
    0
  );
  const focusedMs = focusSessions.reduce((sum, s) => sum + Math.max(0, s.focusedMs), 0);
  const focusedMinutes = Math.round(focusedMs / 60000);

  // Time credited to today's allocated tasks (the plan).
  const allocatedTaskIds = new Set(
    todayTasks.filter((t) => getFocusMode(t) !== "infinite").map((t) => t.id)
  );
  const taskFocusMs = focusSessions
    .filter((s) => s.taskId !== null && allocatedTaskIds.has(s.taskId))
    .reduce((sum, s) => sum + Math.max(0, s.focusedMs), 0);
  const taskFocusedMinutes = Math.round(taskFocusMs / 60000);

  const remainingMinutes = Math.max(0, plannedMinutes - taskFocusedMinutes);
  const completedPomodoros = focusSessions.filter(
    (s) => s.status === "COMPLETED" && s.taskId !== null && allocatedTaskIds.has(s.taskId)
  ).length;
  const interruptions = todaySessions.reduce((sum, s) => sum + s.interruptions, 0);
  const pausedMs = todaySessions.reduce((sum, s) => sum + Math.max(0, s.pausedMs), 0);
  const sessionCount = todaySessions.length;
  const avgInterruptions =
    sessionCount === 0 ? 0 : Math.round((interruptions / sessionCount) * 10) / 10;
  const focusRate =
    plannedMinutes === 0
      ? focusedMinutes > 0
        ? 100
        : 0
      : Math.min(100, Math.round((taskFocusedMinutes / plannedMinutes) * 100));

  const perTask: PerTaskStat[] = todayTasks.map((t) => {
    const linked = focusSessions.filter((s) => s.taskId === t.id);
    const actualMs =
      linked.length > 0
        ? linked.reduce((sum, s) => sum + Math.max(0, s.focusedMs), 0)
        : Math.max(0, t.focusedMinutes) * 60000;
    const actualMinutes = Math.round(actualMs / 60000);
    if (getFocusMode(t) === "infinite") {
      return {
        taskId: t.id,
        title: t.title,
        plannedMinutes: 0,
        actualMinutes,
        remainingMinutes: 0,
        percent: actualMinutes > 0 ? 100 : 0,
        focusMode: "infinite" as const,
        sessionName: t.sessionName ?? null,
      };
    }
    const remaining = Math.max(0, t.allocatedMinutes - actualMinutes);
    const percent =
      t.allocatedMinutes === 0
        ? 0
        : Math.min(100, Math.round((actualMinutes / t.allocatedMinutes) * 100));
    return {
      taskId: t.id,
      title: t.title,
      plannedMinutes: t.allocatedMinutes,
      actualMinutes,
      remainingMinutes: remaining,
      percent,
      focusMode: "allocated" as const,
      sessionName: null,
    };
  });

  const timeline: TimelineEntry[] = todaySessions.map((s) => ({
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    title: getRecordLabel(s, s.taskTitle ?? (isFocus(s) ? "Focus Session" : "Break")),
    phase: s.phase,
    status: s.status,
    focusedMs: s.focusedMs,
    breakMs: s.breakMs ?? 0,
    interruptions: s.interruptions,
    sessionMode: getSessionMode(s),
    sessionName: s.sessionName ?? null,
  }));

  return {
    dateKey,
    plannedMinutes,
    focusedMinutes,
    taskFocusedMinutes,
    remainingMinutes,
    completedPomodoros,
    interruptions,
    pausedMs,
    avgInterruptions,
    focusRate,
    sessionCount,
    perTask,
    timeline,
  };
}
