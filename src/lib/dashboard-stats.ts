import type { Task } from "@/stores/task-store";
import type { SessionRecord } from "@/stores/session-history-store";

export interface PerTaskStat {
  taskId: string;
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
  remainingMinutes: number;
  percent: number;
}

export interface TimelineEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  title: string;
  phase: SessionRecord["phase"];
  status: SessionRecord["status"];
  focusedMs: number;
}

export interface DashboardStats {
  dateKey: string;
  plannedMinutes: number;
  focusedMinutes: number;
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
 * - Planned: sum of allocated minutes for tasks dated `dateKey`.
 * - Actual focus: sum of focusedMs from today's FOCUS sessions (all statuses;
 *   cancelled sessions still contributed real focus). Breaks excluded.
 * - Pomodoros completed: COMPLETED FOCUS sessions only.
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

  const plannedMinutes = todayTasks.reduce((sum, t) => sum + t.allocatedMinutes, 0);
  const focusedMs = focusSessions.reduce((sum, s) => sum + Math.max(0, s.focusedMs), 0);
  const focusedMinutes = Math.round(focusedMs / 60000);
  const remainingMinutes = Math.max(0, plannedMinutes - focusedMinutes);

  const completedPomodoros = focusSessions.filter((s) => s.status === "COMPLETED").length;
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
      : Math.min(100, Math.round((focusedMinutes / plannedMinutes) * 100));

  const perTask: PerTaskStat[] = todayTasks.map((t) => {
    const linked = focusSessions.filter((s) => s.taskId === t.id);
    const actualMs =
      linked.length > 0
        ? linked.reduce((sum, s) => sum + Math.max(0, s.focusedMs), 0)
        : Math.max(0, t.focusedMinutes) * 60000;
    const actualMinutes = Math.round(actualMs / 60000);
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
    };
  });

  const timeline: TimelineEntry[] = todaySessions.map((s) => ({
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    title: s.taskTitle ?? (isFocus(s) ? "Focus Session" : "Break"),
    phase: s.phase,
    status: s.status,
    focusedMs: s.focusedMs,
  }));

  return {
    dateKey,
    plannedMinutes,
    focusedMinutes,
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
