"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { useTaskStore, type Task } from "@/stores/task-store";
import { useSessionHistoryStore, type SessionRecord } from "@/stores/session-history-store";
import { formatDurationMinutes } from "@/lib/utils";
import type { TaskStatus } from "@/types";
import { cn } from "@/lib/utils";

type Range = "week" | "all";

interface Row {
  key: string;
  title: string;
  href: string | null;
  project: string | null;
  status: TaskStatus | null;
  focusedMs: number;
  /** null when there is no planned target (open-ended or unlinked). */
  targetMs: number | null;
  infinite: boolean;
}

interface DayGroup {
  key: string;
  heading: string;
  totalMs: number;
  rows: Row[];
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: Date): Date {
  const c = startOfDay(d);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}
function dayHeading(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  const todayK = keyOf(new Date());
  const yK = keyOf(new Date(Date.now() - 86400000));
  const prefix = key === todayK ? "Today" : key === yK ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "long" });
  return `${prefix} · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function StatusChip({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, { label: string; cls: string }> = {
    COMPLETED: { label: "Done", cls: "bg-primary-fixed text-on-primary-fixed" },
    IN_PROGRESS: { label: "In progress", cls: "bg-accent-amber-container text-on-accent-amber" },
    TODO: { label: "To do", cls: "bg-surface-container text-on-surface-variant" },
    CANCELLED: { label: "Cancelled", cls: "bg-surface-container text-on-surface-variant" },
  };
  const m = map[status];
  return <span className={cn("px-1.5 py-px rounded text-[10px] font-medium whitespace-nowrap", m.cls)}>{m.label}</span>;
}

function taskRow(t: Task, focusedMs: number): Row {
  const infinite = t.focusMode === "infinite";
  const targetMs = infinite || t.allocatedMinutes <= 0 ? null : t.allocatedMinutes * 60000;
  return {
    key: `t:${t.id}`,
    title: t.title,
    href: `/tasks/${t.id}`,
    project: t.project ?? null,
    status: t.status,
    focusedMs,
    targetMs,
    infinite,
  };
}

function RowView({ row }: { row: Row }) {
  const focusedMin = Math.round(row.focusedMs / 60000);
  const pct = row.targetMs ? Math.min(100, Math.round((row.focusedMs / row.targetMs) * 100)) : focusedMin > 0 ? 100 : 0;
  const body = (
    <>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body-sm font-medium text-on-surface truncate">{row.title}</span>
          {row.status && <StatusChip status={row.status} />}
        </div>
        {(row.project || row.targetMs == null) && (
          <div className="flex items-center gap-1.5 mt-0.5 text-label-xs text-on-surface-variant">
            <span className="truncate">{row.project ?? (row.infinite ? "Open-ended" : "Focus session")}</span>
          </div>
        )}
        {row.targetMs != null && (
          <div className="mt-1.5 h-1 w-full max-w-[240px] rounded-full bg-surface-container overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-metric-mono-md text-on-surface font-medium tabular-nums">{formatDurationMinutes(focusedMin)}</div>
        {row.targetMs != null && (
          <div className="text-[10px] text-on-surface-variant">of {formatDurationMinutes(Math.round(row.targetMs / 60000))} · {pct}%</div>
        )}
      </div>
    </>
  );
  const cls = "flex items-center gap-3 px-4 py-3";
  return row.href ? (
    <Link href={row.href} className={cn(cls, "hover:bg-surface-container-low transition-colors")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function HistoryClient() {
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [range, setRange] = useState<Range>("week");

  const days = useMemo<DayGroup[]>(() => {
    const cutoff = range === "week" ? mondayOf(new Date()).getTime() : 0;

    const sessionsByDay = new Map<string, SessionRecord[]>();
    for (const s of sessions) {
      if (s.startedAt < cutoff) continue;
      const k = keyOf(new Date(s.startedAt));
      const arr = sessionsByDay.get(k);
      if (arr) arr.push(s);
      else sessionsByDay.set(k, [s]);
    }

    const tasksByDay = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.date) continue;
      if (new Date(`${t.date}T00:00:00`).getTime() < cutoff) continue;
      const arr = tasksByDay.get(t.date);
      if (arr) arr.push(t);
      else tasksByDay.set(t.date, [t]);
    }

    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const keys = new Set<string>([...Array.from(sessionsByDay.keys()), ...Array.from(tasksByDay.keys())]);

    return Array.from(keys)
      .map((key): DayGroup => {
        const daySessions = sessionsByDay.get(key) ?? [];
        const dayTasks = tasksByDay.get(key) ?? [];

        let totalMs = 0;
        const focusedByTask = new Map<string, number>();
        for (const s of daySessions) {
          const f = Math.max(0, s.focusedMs);
          totalMs += f;
          // Only real focus time puts a task on that day — a break linked to a
          // task shouldn't make the task appear on a day it wasn't worked.
          if (s.taskId && f > 0) focusedByTask.set(s.taskId, (focusedByTask.get(s.taskId) ?? 0) + f);
        }

        const rows: Row[] = [];
        const seen = new Set<string>();

        // Tasks touched that day (with the time logged against them that day).
        focusedByTask.forEach((focusedMs, taskId) => {
          const t = taskById.get(taskId);
          if (t) {
            rows.push(taskRow(t, focusedMs));
            seen.add(taskId);
          } else {
            const s = daySessions.find((x) => x.taskId === taskId);
            rows.push({
              key: `t:${taskId}`,
              title: s?.sessionName?.trim() || s?.taskTitle || "Focus session",
              href: null,
              project: null,
              status: null,
              focusedMs,
              targetMs: null,
              infinite: s?.sessionMode === "infinite",
            });
          }
        });

        // Tasks planned for that day, even if nothing was logged yet.
        for (const t of dayTasks) {
          if (seen.has(t.id)) continue;
          rows.push(taskRow(t, 0));
          seen.add(t.id);
        }

        // Quick sessions not tied to a task.
        for (const s of daySessions) {
          if (s.taskId) continue;
          const title = s.sessionName?.trim() || s.taskTitle || "Focus session";
          const existing = rows.find((r) => r.title === title && r.href === null);
          if (existing) {
            existing.focusedMs += Math.max(0, s.focusedMs);
            existing.infinite = existing.infinite || s.sessionMode === "infinite";
          } else {
            rows.push({
              key: `s:${title}`,
              title,
              href: null,
              project: null,
              status: null,
              focusedMs: Math.max(0, s.focusedMs),
              targetMs: null,
              infinite: s.sessionMode === "infinite",
            });
          }
        }

        rows.sort((a, b) => b.focusedMs - a.focusedMs || (a.title < b.title ? -1 : 1));
        return { key, heading: dayHeading(key), totalMs, rows };
      })
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [tasks, sessions, range]);

  const exportCSV = () => {
    const head = "date,item,focused_min,planned_min,status";
    const lines: string[] = [];
    for (const d of days) {
      for (const r of d.rows) {
        lines.push(
          [
            d.key,
            `"${r.title.replace(/"/g, '""')}"`,
            Math.round(r.focusedMs / 60000),
            r.targetMs ? Math.round(r.targetMs / 60000) : "",
            r.status ?? "",
          ].join(",")
        );
      }
    }
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tempo-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        exportCSV();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-headline-lg text-on-surface tracking-tight">History</h1>
          <p className="text-body-sm text-on-surface-variant">What you got done, day by day.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-0.5 rounded-lg bg-surface-container-low">
            {(["week", "all"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1 rounded-md text-body-sm transition-colors",
                  range === r ? "bg-surface-container-lowest text-on-surface font-medium shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {r === "week" ? "This week" : "All time"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-low shadow-sm transition-all text-body-sm font-medium"
          >
            <Icon name="file_download" className="text-[16px] text-on-surface-variant" />
            <span>Download CSV</span>
          </button>
        </div>
      </header>

      {days.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-8 text-center flex flex-col items-center gap-1">
          <Icon name="history" className="text-[24px] text-on-surface-variant" />
          <p className="text-body-md text-on-surface font-medium">Nothing here yet</p>
          <p className="text-body-sm text-secondary">
            {range === "week" ? "No tasks or focus sessions this week." : "No tasks or focus sessions yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <section key={day.key} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-2 bg-surface-container-low/60">
                <span className="text-label-xs font-semibold text-on-surface">{day.heading}</span>
                <span className="font-mono text-code-badge text-on-surface-variant">
                  {formatDurationMinutes(Math.round(day.totalMs / 60000))} focused
                </span>
              </div>
              <div className="divide-y divide-surface-container-high/60">
                {day.rows.map((row) => (
                  <RowView key={row.key} row={row} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
