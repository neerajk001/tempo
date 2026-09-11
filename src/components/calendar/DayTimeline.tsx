"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { usePrefsStore } from "@/stores/prefs-store";
import { useTaskStore, type Task } from "@/stores/task-store";
import { useNow } from "@/hooks/useNow";
import { getRemainingMs } from "@/lib/pomodoro-machine";
import { calculatePomodoroPlan } from "@/lib/task-planning";
import { detectConflicts, subtractBusy, type BusyEvent } from "@/lib/day-planner";
import { formatClock, formatDurationMinutes } from "@/lib/utils";
import type { CalendarEvent } from "@/services/google-calendar";
import { cn } from "@/lib/utils";

export const GRID_START_HOUR = 8;
export const GRID_END_HOUR = 19;
export const HOUR_PX = 80;

/**
 * Grid window for a day: the default 08:00–19:00 expanded just enough to
 * include timed events/tasks outside it (clamped to the calendar day).
 * Late-night events like 21:30–23:00 extend the grid instead of vanishing.
 */
export function dayBounds(
  events: Array<{ startMs: number; endMs: number; allDay?: boolean }>,
  tasks: Array<{ startMs?: number | null; endMs?: number | null }>
): { startHour: number; endHour: number } {
  let s = GRID_START_HOUR;
  let e = GRID_END_HOUR;
  const consider = (ms: number) => {
    const d = new Date(ms);
    s = Math.min(s, d.getHours());
    const ceilH = d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0 ? d.getHours() + 1 : d.getHours();
    e = Math.max(e, ceilH);
  };
  events.forEach((ev) => {
    if (ev.allDay) return;
    consider(ev.startMs);
    consider(ev.endMs);
  });
  tasks.forEach((t) => {
    if (t.startMs && t.endMs) {
      consider(t.startMs);
      consider(t.endMs);
    }
  });
  return { startHour: Math.max(0, s), endHour: Math.min(24, Math.max(e, s + 1)) };
}

function fmtRange(a: number, b: number): string {
  const f = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${f(a)} — ${f(b)}`;
}

/**
 * Initial scroll offset for the capped grid viewport: the now-cursor when
 * live, else the day's first block. Pure (unit-tested).
 */
export function initialScrollTop(showCursor: boolean, anchorMs: number | null, gridStartMs: number): number {
  if (anchorMs === null || anchorMs === undefined || !Number.isFinite(anchorMs)) return 0;
  return Math.max(0, ((anchorMs - gridStartMs) / 3600000) * HOUR_PX - 200);
}

function LiveRemaining() {
  const session = usePomodoroStore((s) => s.session);
  const now = useNow(true);
  return <span>{formatClock(Math.ceil(getRemainingMs(session, now) / 1000))}</span>;
}

function TaskBlock({ task, dayStart, dayEnd }: { task: Task; dayStart: number; dayEnd: number }) {
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const ticking = usePomodoroStore((s) => s.session.status === "RUNNING" || s.session.status === "PAUSED");
  const linked = task.id === activeTaskId && ticking;
  const s = Math.max(task.startMs ?? dayStart, dayStart);
  const e = Math.min(task.endMs ?? dayEnd, dayEnd);
  const top = ((s - dayStart) / 3600000) * HOUR_PX;
  const height = Math.max(56, ((e - s) / 3600000) * HOUR_PX);

  let slices: Array<{ label: string; sub: string; kind: "focus" | "break" }> = [];
  try {
    const plan = calculatePomodoroPlan(task.allocatedMinutes, task.focusMinutes);
    let cursor = s;
    plan.slice(0, 5).forEach((p, i) => {
      const end = Math.min(cursor + p.minutes * 60000, e);
      if (end <= cursor) return;
      slices.push({ label: `POMO ${i + 1} (${p.minutes}m)`, sub: `${fmtRange(cursor, end)}`, kind: "focus" });
      cursor = end;
      if (cursor < e && i < 4) {
        const bEnd = Math.min(cursor + 10 * 60000, e);
        if (bEnd > cursor) slices.push({ label: "BREAK", sub: "10m rest", kind: "break" });
        cursor = bEnd;
      }
    });
  } catch {
    slices = [];
  }
  const doneCount = task.completedPomodoros;

  return (
    <div
      className="absolute left-0 right-0 rounded-xl bg-surface-container-low shadow-sm p-2.5 sm:p-3 flex flex-col justify-between overflow-hidden"
      style={{ top, height }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", linked ? "bg-primary animate-pulse" : "bg-secondary")} />
          <Link href={`/tasks/${task.id}`} className="text-headline-md text-on-surface truncate hover:text-primary transition-colors">
            {task.title}
          </Link>
          {linked && (
            <span className="font-mono text-code-badge px-1.5 py-0.5 rounded bg-primary text-on-primary font-semibold flex-shrink-0">Active Session</span>
          )}
          <span className="font-mono text-code-badge text-on-surface-variant hidden md:inline whitespace-nowrap">
            {fmtRange(s, e)} ({formatDurationMinutes(Math.round((e - s) / 60000))})
          </span>
        </div>
        <span className="font-mono text-code-badge text-primary font-semibold bg-surface-container-lowest px-2 py-0.5 rounded shadow-sm whitespace-nowrap hidden sm:inline">
          Pomodoro {Math.min(doneCount + 1, Math.max(slices.length, 1))} of {Math.max(task.completedPomodoros + slices.length, 1)}
        </span>
      </div>
      {height > 110 && (
        <div className="hidden sm:grid grid-cols-5 gap-1 mt-1.5 flex-1 min-h-0">
          {slices.map((sl, i) =>
            sl.kind === "break" ? (
              <div key={i} className="rounded-lg bg-surface-variant/40 p-1.5 flex flex-col justify-center items-center text-center min-h-0">
                <Icon name="self_improvement" className="text-[16px] text-secondary" />
                <span className="font-mono text-code-badge font-semibold text-secondary">BREAK</span>
                <span className="text-label-xs text-on-surface-variant">{sl.sub}</span>
              </div>
            ) : (
              <div key={i} className="rounded-lg bg-surface-container-lowest shadow-sm p-1.5 flex flex-col justify-between relative overflow-hidden min-h-0">
                {linked && i === 0 && <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />}
                <div className="font-mono text-code-badge text-primary font-semibold truncate">{sl.label}</div>
                <div className="text-body-sm text-on-surface truncate">{task.title.split(" ").slice(0, 2).join(" ")}</div>
                {linked && i === 0 ? (
                  <div className="text-label-xs text-on-surface-variant">In progress <span className="font-mono text-code-badge text-primary font-bold"><LiveRemaining /></span></div>
                ) : (
                  <div className="text-label-xs text-on-surface-variant">{sl.sub}</div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function DayTimeline({
  day,
  events,
  tasks,
  showCursor,
  nowMs,
}: {
  day: Date;
  events: CalendarEvent[];
  tasks: Task[];
  showCursor: boolean;
  nowMs: number;
}) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const collisionMode = usePrefsStore((s) => s.collisionMode);
  const [ignored, setIgnored] = useState<string[]>([]);

  const { startHour, endHour } = dayBounds(events, tasks);
  const dayBase = new Date(day);
  dayBase.setHours(0, 0, 0, 0);
  const start = dayBase.getTime() + startHour * 3600000;
  const end = dayBase.getTime() + endHour * 3600000;
  const spanHours = endHour - startHour;
  const hours = Array.from({ length: spanHours + 1 }, (_, i) => startHour + i);

  const timed = tasks.filter((t) => t.startMs && t.endMs && t.endMs > start && t.startMs < end);
  const busy: BusyEvent[] = events.filter((e) => !e.allDay).map((e) => ({ id: e.id, title: e.title, startMs: e.startMs, endMs: e.endMs }));
  const blocks = timed.map((t) => ({ id: t.id, title: t.title, startMs: Math.max(t.startMs!, start), endMs: Math.min(t.endMs!, end) }));
  const conflicts = detectConflicts(
    blocks.map((b) => ({ ...b, type: "focus" as const, minutes: Math.round((b.endMs - b.startMs) / 60000) })),
    busy
  ).filter((c) => !ignored.includes(`${c.block.id}:${c.event.id}`));

  const free = subtractBusy({ startMs: start, endMs: end }, [
    ...busy.map((b) => ({ startMs: b.startMs, endMs: b.endMs })),
    ...blocks.map((b) => ({ startMs: b.startMs, endMs: b.endMs })),
  ]).filter((s) => s.endMs - s.startMs >= 15 * 60000);

  const cursorTop = showCursor ? ((nowMs - start) / 3600000) * HOUR_PX : null;
  const cursorLabel = new Date(nowMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  // The grid scrolls inside a capped viewport (page never grows with late hours).
  // Jump straight to the now-cursor, else to the first block of the day.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firsts = [
      ...events.filter((e) => !e.allDay).map((e) => e.startMs),
      ...tasks.filter((t) => t.startMs).map((t) => t.startMs as number),
    ];
    const anchor = showCursor ? nowMs : firsts.length > 0 ? Math.min(...firsts) : null;
    el.scrollTo({ top: initialScrollTop(showCursor, anchor, start) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={scrollRef} className="relative w-full select-none overflow-y-auto" style={{ maxHeight: "68vh" }}>
    <div className="relative w-full" style={{ minHeight: spanHours * HOUR_PX + 40 }}>
      <div className="flex flex-col w-full h-full pointer-events-none">
        {hours.map((h) => (
          <div key={h} className="flex items-start" style={{ height: h === endHour ? 40 : HOUR_PX }}>
            <div className="w-16 font-mono text-metric-mono-md text-on-surface-variant pr-3 text-right -mt-2.5">
              {String(h).padStart(2, "0")}:00
            </div>
            <div className="flex-1 h-px bg-surface-container-low mt-0" />
          </div>
        ))}
      </div>

      {cursorTop !== null && cursorTop >= 0 && cursorTop <= spanHours * HOUR_PX && (
        <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: cursorTop }}>
          <div className="w-16 pr-1 flex justify-end">
            <span className="bg-primary text-on-primary font-mono text-code-badge font-semibold px-1 py-0.5 rounded shadow-sm">{cursorLabel}</span>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-primary -ml-1 ring-2 ring-surface-container-lowest" />
          <div className="flex-1 h-[2px] bg-primary" />
        </div>
      )}

      <div className="absolute left-20 right-2 top-0 bottom-0">
        {events.filter((e) => !e.allDay && e.endMs > start && e.startMs < end).map((e) => {
          const s = Math.max(e.startMs, start);
          const en = Math.min(e.endMs, end);
          const top = ((s - start) / 3600000) * HOUR_PX;
          const height = Math.max(36, ((en - s) / 3600000) * HOUR_PX);
          const finished = en < nowMs;
          return (
            <div
              key={e.id}
              className="absolute left-0 right-0 rounded-lg bg-surface-container-high/70 px-3 py-1 flex items-center justify-between hover:bg-surface-container-high transition-all overflow-hidden"
              style={{ top, height }}
              title={`${e.title} (${fmtRange(e.startMs, e.endMs)})`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon name="event" className="text-[15px] text-tertiary flex-shrink-0" />
                <span className="text-body-sm font-semibold text-on-surface truncate">{e.title}</span>
                <span className="font-mono text-code-badge text-on-surface-variant hidden sm:inline whitespace-nowrap">{fmtRange(e.startMs, e.endMs)}</span>
              </div>
              <span className="font-mono text-code-badge px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium flex-shrink-0">
                {finished ? "Finished" : "Scheduled"}
              </span>
            </div>
          );
        })}

        {timed.map((t) => (
          <TaskBlock key={t.id} task={t} dayStart={start} dayEnd={end} />
        ))}

        {free.map((f, i) => {
          const top = ((f.startMs - start) / 3600000) * HOUR_PX;
          const height = ((f.endMs - start) / 3600000) * HOUR_PX - top;
          if (height < 30) return null;
          return (
            <div
              key={i}
              className="absolute left-0 right-0 rounded-lg border border-dashed border-surface-container-highest px-3 flex items-center justify-between overflow-hidden"
              style={{ top, height: Math.max(30, height) }}
            >
              <span className="text-label-xs text-secondary">Open buffer • {formatDurationMinutes(Math.round((f.endMs - f.startMs) / 60000))} protected</span>
              <span className="font-mono text-code-badge text-on-surface-variant hidden sm:inline">{fmtRange(f.startMs, f.endMs)}</span>
            </div>
          );
        })}

        {conflicts.slice(0, 1).map((c) => (
          <div key={`${c.block.id}:${c.event.id}`} className="absolute left-0 right-0 rounded-xl bg-accent-amber-container/95 border border-accent-amber/25 p-2.5 z-10" style={{ top: ((Math.max(c.block.startMs, start) - start) / 3600000) * HOUR_PX - 4 }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-on-accent-amber min-w-0">
                <Icon name="error" className="text-[16px] text-accent-amber flex-shrink-0" />
                <span className="text-body-sm font-bold truncate">Overlap Detected with {c.event.title}</span>
              </div>
              <span className="font-mono text-code-badge bg-accent-amber text-surface px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                {fmtRange(c.event.startMs, c.event.endMs)} Collision
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {collisionMode === "auto" ? (
                <button
                  type="button"
                  onClick={() => {
                    const t = timed.find((x) => x.id === c.block.id);
                    if (t?.startMs && t?.endMs) updateTask(t.id, { startMs: t.startMs + 3600000, endMs: t.endMs + 3600000 });
                  }}
                  className="px-3 py-1 rounded bg-accent-amber hover:brightness-110 text-surface text-body-sm font-semibold transition-colors shadow-sm"
                >
                  Auto-Shift Focus (+60m)
                </button>
              ) : (
                <span className="px-3 py-1 rounded bg-accent-amber/20 text-on-accent-amber text-body-sm font-semibold">
                  Flagged for review
                </span>
              )}
              <Link href="/plan" className="px-3 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container text-body-sm transition-colors shadow-sm border border-outline-variant">
                Adjust Plan [A]
              </Link>
              <button
                type="button"
                onClick={() => setIgnored((s) => [...s, `${c.block.id}:${c.event.id}`])}
                className="px-3 py-1 rounded text-on-accent-amber hover:text-on-surface text-body-sm"
              >
                Ignore Conflict
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
