"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getRemainingMs } from "@/lib/pomodoro-machine";
import { getTaskProgress } from "@/lib/task-planning";
import { formatClock, formatDurationMinutes } from "@/lib/utils";
import type { Task } from "@/stores/task-store";import { usePomodoroStore } from "@/stores/pomodoro-store";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

type Tab = "all" | "active" | "upcoming";

function fmtRange(t: Task): string {
  if (t.startMs && t.endMs) {
    const f = (ms: number) =>
      new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${f(t.startMs)} — ${f(t.endMs)}`;
  }
  return "Flexible";
}

function startsIn(t: Task, now: number): string | null {
  if (!t.startMs || t.startMs <= now) return null;
  const m = Math.round((t.startMs - now) / 60000);
  if (m < 60) return `Starts in ${m}m`;
  return `Starts in ${Math.floor(m / 60)}h ${m % 60}m`;
}

function LiveLeft() {
  const session = usePomodoroStore((s) => s.session);
  const now = useNow(true);
  return (
    <span className="font-mono text-code-badge text-primary font-semibold">
      Live • {formatClock(Math.ceil(getRemainingMs(session, now) / 1000))} left
    </span>
  );
}

export default function ScheduleList({ tasks }: { tasks: Task[] }) {
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const timerStatus = usePomodoroStore((s) => s.session.status);
  const [tab, setTab] = useState<Tab>("all");
  const now = Date.now();

  const isLive = (t: Task) => t.id === activeTaskId && (timerStatus === "RUNNING" || timerStatus === "PAUSED");
  const isActive = (t: Task) => t.id === activeTaskId || t.status === "IN_PROGRESS";
  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => (isActive(t) && t.status !== "COMPLETED") || isLive(t)).length,
      upcoming: tasks.filter((t) => t.status === "TODO").length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, activeTaskId, timerStatus]
  );

  const visible = tasks.filter((t) => {
    if (tab === "active") return (isActive(t) && t.status !== "COMPLETED") || isLive(t);
    if (tab === "upcoming") return t.status === "TODO";
    return true;
  });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "all", label: `All (${counts.all})` },
    { id: "active", label: `Active (${counts.active})` },
    { id: "upcoming", label: `Upcoming (${counts.upcoming})` },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-headline-md text-on-surface font-semibold tracking-tight">Today&apos;s Work Schedule</h3>
          <span className="px-1.5 py-0.5 rounded-full bg-surface-container-high font-mono text-code-badge font-semibold text-secondary">
            {tasks.length} blocks
          </span>
        </div>
        <div className="inline-flex items-center bg-surface-container rounded-lg p-0.5 gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 h-6 rounded-md text-label-xs",
                tab === t.id
                  ? "bg-surface-container-lowest text-on-surface font-semibold shadow-sm"
                  : "text-secondary hover:text-on-surface font-medium"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {visible.length === 0 && (
          <div className="p-4 bg-surface-container-lowest rounded-xl shadow-sm text-body-sm text-secondary">
            Nothing here. Create a task or sync your calendar to fill the schedule.
          </div>
        )}
        {visible.map((t, i) => {
          const p = getTaskProgress(t.allocatedMinutes, t.focusedMinutes, t.focusMinutes);
          const active = isActive(t);
          const upcoming = startsIn(t, now);
          return (
            <div key={t.id} className="group relative flex flex-col p-4 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant hover:border-outline transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                    active ? "bg-primary-fixed text-primary" : "bg-surface-container text-secondary"
                  )}>
                    <Icon name={active ? "bolt" : t.calendarEventId ? "event" : i % 2 ? "dns" : "menu_book"} className="text-[18px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-code-badge font-semibold text-on-surface">{fmtRange(t)}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded font-mono text-code-badge font-medium",
                        active ? "bg-primary-fixed text-primary" : "bg-surface-container text-on-surface-variant"
                      )}>
                        {t.focusMinutes}m blocks
                      </span>
                      {t.calendarEventId && (
                        <span className="inline-flex items-center gap-1 text-secondary text-label-xs">
                          <Icon name="event" className="text-[13px] text-tertiary" />
                          <span>Cal Synced</span>
                        </span>
                      )}
                    </div>
                    <Link href={`/tasks/${t.id}`} className="text-headline-md text-on-surface font-semibold tracking-tight mt-0.5 truncate hover:text-primary transition-colors">{t.title}</Link>
                    {t.description && (
                      <div className="text-body-sm text-on-surface-variant line-clamp-1 mt-0.5">{t.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {isLive(t) ? (
                    <span className="inline-flex items-center gap-1 text-label-xs px-1.5 py-0.5 rounded bg-primary-fixed text-primary font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {timerStatus === "PAUSED" ? "Paused" : "In Progress"}
                    </span>
                  ) : t.status === "COMPLETED" ? (
                    <span className="text-label-xs px-1.5 py-0.5 rounded bg-surface-container text-secondary font-medium">Done</span>
                  ) : active ? (
                    <span className="inline-flex items-center gap-1 text-label-xs px-1.5 py-0.5 rounded bg-primary-fixed text-primary font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      In Progress
                    </span>
                  ) : (
                    <span className="text-label-xs px-1.5 py-0.5 rounded bg-surface-container text-secondary font-medium">
                      {upcoming ?? "Scheduled"}
                    </span>
                  )}
                  <span className="font-mono text-code-badge text-on-surface-variant font-medium">
                    {formatDurationMinutes(t.focusedMinutes)} / {formatDurationMinutes(t.allocatedMinutes)}
                  </span>
                  {isLive(t) && (
                    <Link href="/focus" className="font-mono text-code-badge text-primary font-semibold underline">
                      Open focus →
                    </Link>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-label-xs text-secondary">
                  <span>{p.percent > 0 ? "Execution pace" : "Planned block"}</span>
                  {isLive(t) ? (
                    <LiveLeft />
                  ) : (
                    <span className={cn("font-mono text-code-badge font-medium", p.percent > 0 ? "font-semibold text-primary" : "text-secondary")}>
                      {p.percent > 0 ? `${p.percent}% allocated` : `${formatDurationMinutes(t.allocatedMinutes)} allocated`}
                    </span>
                  )}
                </div>
                <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", p.percent > 0 ? "bg-primary" : "bg-secondary-fixed-dim")} style={{ width: `${p.percent}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
