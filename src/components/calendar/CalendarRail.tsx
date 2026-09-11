"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import { subtractBusy } from "@/lib/day-planner";
import { formatDurationMinutes } from "@/lib/utils";
import { useTaskStore, type Task } from "@/stores/task-store";
import type { CalendarEvent } from "@/services/google-calendar";
import { cn } from "@/lib/utils";

export function monthCells(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarRail({
  viewed,
  onSelectDay,
  taskDates,
  backlog,
  viewedEvents,
  viewedTasks,
  onQuickAdd,
}: {
  viewed: Date;
  onSelectDay: (d: Date) => void;
  taskDates: Set<string>;
  backlog: Task[];
  viewedEvents: CalendarEvent[];
  viewedTasks: Task[];
  onQuickAdd: () => void;
}) {
  const { data: session, status } = useSession();
  const updateTask = useTaskStore((s) => s.updateTask);
  const authed = status === "authenticated";
  const [monthNav, setMonthNav] = useState(0);

  const base = new Date(viewed.getFullYear(), viewed.getMonth() + monthNav, 1);
  const cells = monthCells(base.getFullYear(), base.getMonth());
  const label = base.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const scheduled = viewedTasks.filter((t) => t.startMs && t.endMs).length;

  const quickBlock = (t: Task) => {
    const day = new Date(viewed);
    day.setHours(9, 0, 0, 0);
    const spanStart = day.getTime();
    const spanEnd = spanStart + 10 * 3600000;
    const busy = [
      ...viewedEvents.filter((e) => !e.allDay).map((e) => ({ startMs: e.startMs, endMs: e.endMs })),
      ...viewedTasks.filter((x) => x.startMs && x.endMs).map((x) => ({ startMs: x.startMs!, endMs: x.endMs! })),
    ];
    const free = subtractBusy({ startMs: spanStart, endMs: spanEnd }, busy);
    const slot = free.find((f) => f.endMs - f.startMs >= 30 * 60000);
    if (!slot) return;
    const dur = Math.min(t.allocatedMinutes * 60000, slot.endMs - slot.startMs);
    updateTask(t.id, { date: dateKey(day), startMs: slot.startMs, endMs: slot.startMs + dur });
  };

  return (
    <aside className="flex flex-col gap-4">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-headline-md text-on-surface font-semibold">{label}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonthNav((n) => n - 1)} className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors">
              <Icon name="chevron_left" className="text-[16px]" />
            </button>
            <button type="button" onClick={() => setMonthNav((n) => n + 1)} className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors">
              <Icon name="chevron_right" className="text-[16px]" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center font-mono text-code-badge text-on-surface-variant">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 text-center gap-y-1 font-mono text-metric-mono-md">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="py-1" />;
            const key = dateKey(d);
            const selected = dateKey(viewed) === key;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectDay(d)}
                className={cn(
                  "py-1 rounded relative",
                  selected
                    ? "bg-primary text-on-primary font-semibold shadow-sm"
                    : "text-on-surface hover:bg-surface-container-low"
                )}
              >
                {d.getDate()}
                {taskDates.has(key) && (
                  <span className={cn("absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full", selected ? "bg-surface-container-lowest" : "bg-primary")} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-headline-md text-on-surface font-semibold">Backlog Queue</span>
            <span className="font-mono text-code-badge px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-bold">{backlog.length} items</span>
          </div>
          <span className="text-label-xs text-on-surface-variant">Ready to block</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {backlog.length === 0 && (
            <p className="text-body-sm text-secondary">Backlog is clear — every task has a time block.</p>
          )}
          {backlog.slice(0, 6).map((t) => (
            <div key={t.id} className="p-3 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col gap-1.5 group">
              <div className="flex items-start justify-between gap-1.5">
                <span className="text-body-sm font-medium text-on-surface leading-tight">{t.title}</span>
                <span className="font-mono text-code-badge text-on-surface-variant flex-shrink-0 bg-surface-container-lowest px-1 rounded">{formatDurationMinutes(t.allocatedMinutes)} est</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-label-xs text-on-surface-variant capitalize">{t.project ?? "No project"} • {t.priority}</span>
                <button
                  type="button"
                  onClick={() => quickBlock(t)}
                  className="flex items-center gap-1 text-label-xs text-primary font-semibold hover:underline"
                >
                  <Icon name="add" className="text-[14px]" />
                  <span>Block Time</span>
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onQuickAdd}
          className="w-full py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-body-sm text-on-surface font-medium flex items-center justify-center gap-1.5"
        >
          <Icon name="add_circle_outline" className="text-[16px]" />
          <span>Quick Add Task to Backlog</span>
        </button>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-headline-md text-on-surface font-semibold">Integrations</span>
          <span className="font-mono text-code-badge text-on-primary-fixed font-semibold bg-primary-fixed px-1.5 py-0.5 rounded">
            {authed ? "1 Active" : "0 Active"}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="p-1.5 rounded-lg bg-surface-container-low flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon name="calendar_month" className="text-[18px] text-tertiary" />
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="text-body-sm font-medium text-on-surface truncate">Google Calendar</span>
                <span className="text-label-xs text-on-surface-variant truncate">
                  {authed ? `${session?.user?.email ?? "Connected"} • Default` : "Not connected"}
                </span>
              </div>
            </div>
            <span className={cn("w-2 h-2 rounded-full", authed ? "bg-primary" : "bg-outline-variant")} />
          </div>
          <div className="p-1.5 rounded-lg bg-surface-container-low flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon name="task_alt" className="text-[18px] text-primary" />
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="text-body-sm font-medium text-on-surface truncate">Tempo Tasks</span>
                <span className="text-label-xs text-on-surface-variant truncate">{scheduled} blocks scheduled</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-primary" />
          </div>
        </div>

      </div>

      <div className="p-3 rounded-xl bg-surface-container-high/60 shadow-sm flex flex-col gap-1 text-on-surface-variant">
        <div className="flex items-center justify-between">
          <span className="font-mono text-code-badge font-semibold text-on-surface">CALENDAR SHORTCUTS</span>
          <Icon name="keyboard" className="text-[14px]" />
        </div>
        <div className="grid grid-cols-3 gap-1 mt-1 text-center font-mono text-code-badge">
          {(Object.entries({ C: "Schedule", T: "Today", S: "Sync" }) as Array<[string, string]>).map(([k, label]) => (
            <div key={k} className="bg-surface-container-lowest p-1 rounded shadow-sm">
              <span className="font-bold text-on-surface">{k}</span> {label}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
