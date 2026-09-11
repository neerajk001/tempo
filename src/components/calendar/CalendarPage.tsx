"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import DayTimeline, { dayBounds } from "@/components/calendar/DayTimeline";
import CalendarRail, { dateKey } from "@/components/calendar/CalendarRail";
import NewTaskModal from "@/components/tasks/NewTaskModal";
import { computeDashboardStats } from "@/lib/dashboard-stats";
import { detectConflicts } from "@/lib/day-planner";
import { formatDurationMinutes } from "@/lib/utils";
import { CAL_SYNC_STAMP_KEY } from "@/lib/assets";
import { useTaskStore } from "@/stores/task-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import type { CalendarEvent } from "@/services/google-calendar";
import { cn } from "@/lib/utils";

type View = "day" | "3day";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function relativeAgo(ms: number | null): string {
  if (ms === null) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}


export default function CalendarPage() {
  const { data: session, status } = useSession();
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);

  const [dayOffset, setDayOffset] = useState(0);
  const [view, setView] = useState<View>("day");
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStamp, setSyncStamp] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const viewed = useMemo(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);
  const viewedKey = dateKey(viewed);
  const spanDays = view === "3day" ? 3 : 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const start = startOfDay(viewed);
      const end = new Date(start.getTime() + spanDays * 24 * 60 * 60 * 1000);
      const res = await fetch(
        `/api/calendar/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`
      );
      const data = (await res.json()) as { events?: CalendarEvent[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Calendar unavailable.");
        setEvents(null);
        return;
      }
      setEvents(data.events ?? []);
      const stamp = Date.now();
      setSyncStamp(stamp);
      try {
        window.localStorage.setItem(CAL_SYNC_STAMP_KEY, String(stamp));
      } catch {
        // Optional.
      }
    } catch {
      setError("Calendar unavailable. Your locally created tasks and Pomodoro timer will continue working.");
      setEvents(null);
    } finally {
      setLoading(false);
    }
  }, [viewed, spanDays]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CAL_SYNC_STAMP_KEY);
      setSyncStamp(v ? Number(v) : null);
    } catch {
      setSyncStamp(null);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (modalOpen) return;
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setModalOpen(true);
      } else if (e.key === "t" || e.key === "T") {
        setDayOffset(0);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, load]);

  const days = useMemo(
    () => Array.from({ length: spanDays }, (_, i) => new Date(viewed.getTime() + i * 24 * 60 * 60 * 1000)),
    [viewed, spanDays]
  );
  const viewedTasks = useMemo(() => tasks.filter((t) => t.date === viewedKey), [tasks, viewedKey]);
  const backlog = useMemo(
    () => tasks.filter((t) => !t.startMs || !t.endMs).filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED"),
    [tasks]
  );
  const taskDates = useMemo(() => new Set(tasks.map((t) => t.date)), [tasks]);
  const stats = useMemo(() => computeDashboardStats(tasks, sessions, viewedKey), [tasks, sessions, viewedKey]);

  const dayEvents = useMemo(
    () =>
      (events ?? []).filter((e) => {
        const s = new Date(e.startMs);
        return dateKey(s) === viewedKey;
      }),
    [events, viewedKey]
  );

  const timedBlocks = viewedTasks.filter((t) => t.startMs && t.endMs);
  const firstConflict = useMemo(() => {
    const busy = dayEvents.filter((e) => !e.allDay).map((e) => ({ id: e.id, title: e.title, startMs: e.startMs, endMs: e.endMs }));
    const found = detectConflicts(
      timedBlocks.map((t) => ({ id: t.id, title: t.title, startMs: t.startMs!, endMs: t.endMs!, type: "focus" as const, minutes: t.allocatedMinutes })),
      busy
    );
    return found[0] ?? null;
  }, [timedBlocks, dayEvents]);

  const workMin = viewedTasks.reduce((s, t) => s + t.allocatedMinutes, 0);
  const meetMin = Math.round(dayEvents.filter((e) => !e.allDay).reduce((s, e) => s + (e.endMs - e.startMs), 0) / 60000);
  const gridSpanMin = (dayBounds(dayEvents, viewedTasks).endHour - dayBounds(dayEvents, viewedTasks).startHour) * 60;
  const bufferMin = Math.max(0, gridSpanMin - workMin - meetMin);

  if (status === "loading") {
    return (
      <Card>
        <p className="text-sm text-on-surface-variant">Checking calendar connection…</p>
      </Card>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-headline-lg text-on-surface tracking-tight">Calendar</h1>
            <span className="font-mono text-code-badge px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">Time Engine</span>
          </div>
          <p className="text-body-sm text-on-surface-variant">Plan your day around the time you actually have.</p>
        </div>
        <Card>
          <p className="text-sm font-medium">Connect Google Calendar</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Read-only access to today&apos;s planned events. Local tasks and the Pomodoro timer keep working without it.
          </p>
          <div className="mt-3">
            <Button onClick={() => signIn("google")}>Connect Google Calendar</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-headline-lg text-on-surface tracking-tight">Calendar</h1>
            <span className="font-mono text-code-badge px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">Time Engine</span>
          </div>
          <p className="text-body-sm text-on-surface-variant">Plan your day around the time you actually have.</p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-lowest shadow-sm text-on-surface-variant">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/70 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-label-xs">Google Calendar synced • {relativeAgo(syncStamp)}</span>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-surface-container-lowest shadow-sm hover:bg-surface-container-low text-on-surface transition-colors text-body-sm disabled:opacity-60"
          >
            <Icon name="sync" className="text-[16px] text-on-surface-variant" />
            <span>{loading ? "Syncing…" : "Sync Now"}</span>
            <span className="font-mono text-code-badge bg-surface-container text-on-surface-variant px-1 rounded shadow-sm ml-1">⌘R</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-surface-container-lowest shadow-sm text-on-surface text-body-sm">
            <Icon name="calendar_month" className="text-[16px] text-primary" />
            <span className="truncate max-w-[170px]">{session?.user?.email ?? "Account"}</span>
          </div>
        </div>
      </div>

      {/* Date nav + views */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-2 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 min-w-0 max-w-full">
              <button type="button" title="Previous day" onClick={() => setDayOffset((n) => n - 1)} className="p-2 md:p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex-shrink-0">
                <Icon name="chevron_left" className="text-[18px]" />
              </button>
              <div className="px-2 sm:px-3 py-0.5 text-headline-md text-on-surface select-none whitespace-nowrap truncate min-w-0">
                {viewed.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </div>
              <button type="button" title="Next day" onClick={() => setDayOffset((n) => n + 1)} className="p-2 md:p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex-shrink-0">
                <Icon name="chevron_right" className="text-[18px]" />
              </button>
            </div>
            <button type="button" onClick={() => setDayOffset(0)} className="px-3 h-7 rounded bg-surface-container-low hover:bg-surface-container text-on-surface transition-colors text-body-sm">
              Today
            </button>
          </div>
          <div className="flex items-center bg-surface-container-low p-0.5 rounded-lg self-start md:self-auto">
            {(
              [
                { id: "day", label: "Day View" },
                { id: "3day", label: "3-Day" },
              ] as Array<{ id: View; label: string }>
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  "px-4 py-1 rounded text-label-xs",
                  view === v.id ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface transition-colors"
                )}
              >
                {v.label}
              </button>
            ))}

          </div>
        </div>

        {/* Telemetry */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
          <div className="p-3 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant flex flex-col justify-between">
            <span className="text-label-xs uppercase tracking-wider text-on-surface-variant">Total Work Blocked</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-metric-mono-lg text-on-surface tabular-nums">{formatDurationMinutes(workMin)}</span>
              <span className="font-mono text-code-badge text-on-surface-variant">/ 8h cap</span>
            </div>
          </div>
          <div className="p-3 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-label-xs uppercase tracking-wider text-on-surface-variant">Deep Focus</span>
              <span className="font-mono text-code-badge px-1 py-0.5 rounded bg-secondary-container text-on-secondary-fixed">{stats.completedPomodoros} Pomodoros</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-metric-mono-lg text-primary tabular-nums">{formatDurationMinutes(stats.focusedMinutes)}</span>
              <span className="font-mono text-code-badge text-on-surface-variant">{stats.focusRate}% ratio</span>
            </div>
          </div>
          <div className="p-3 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant flex flex-col justify-between">
            <span className="text-label-xs uppercase tracking-wider text-on-surface-variant">Calendar Meetings</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-metric-mono-lg text-on-surface tabular-nums">{formatDurationMinutes(meetMin)}</span>
              <span className="font-mono text-code-badge text-on-surface-variant">{dayEvents.filter((e) => !e.allDay).length} scheduled</span>
            </div>
          </div>
          <div className="p-3 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant flex flex-col justify-between">
            <span className="text-label-xs uppercase tracking-wider text-on-surface-variant">Open Buffers</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-metric-mono-lg text-secondary tabular-nums">{formatDurationMinutes(bufferMin)}</span>
              <span className="font-mono text-code-badge text-on-surface-variant">slack/prep</span>
            </div>
          </div>
          {firstConflict ? (
            <div className="col-span-2 md:col-span-1 p-3 bg-accent-amber-container border border-accent-amber/25 rounded-xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-on-accent-amber">
                <Icon name="warning" className="text-[16px] text-accent-amber" />
                <span className="text-label-xs font-semibold uppercase tracking-wider">Collision Alert</span>
              </div>
              <div className="mt-0.5">
                <span className="text-body-sm font-semibold text-on-surface">
                  1 Conflict at {new Date(firstConflict.event.startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                </span>
                <span className="block text-label-xs text-on-accent-amber">{firstConflict.event.title} overlap</span>
              </div>
            </div>
          ) : (
            <div className="col-span-2 md:col-span-1 p-3 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <Icon name="check_circle" className="text-[16px] text-primary" />
                <span className="text-label-xs font-semibold uppercase tracking-wider">Schedule Clear</span>
              </div>
              <span className="text-body-sm font-medium text-on-surface mt-0.5">No collisions</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Card>
          <p className="text-sm font-medium">Calendar unavailable</p>
          <p className="mt-1 text-sm text-on-surface-variant">{error} Your locally created tasks and Pomodoro timer will continue working.</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={load}>Retry</Button>
          </div>
        </Card>
      )}

      {/* Canvas */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <section className="xl:col-span-9 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-3 sm:p-4 flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between pb-2 mb-2 bg-surface-container-low/40 px-3 py-1.5 rounded-lg flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-code-badge text-on-surface font-semibold">GRID CADENCE</span>
              <span className="font-mono text-code-badge text-on-surface-variant">15-minute quanta • Continuous current-time cursor</span>
            </div>
            <div className="flex items-center gap-1.5 text-label-xs text-on-surface-variant">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary" />
              <span>Tempo Focus</span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-surface-variant ml-1.5" />
              <span>Buffer</span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-tertiary-fixed ml-1.5" />
              <span>G-Calendar</span>
            </div>
          </div>
          <div className="flex flex-col gap-8">
            {days.map((d) => {
              const key = dateKey(d);
              const dayEvts = (events ?? []).filter((e) => {
                const s = new Date(e.startMs);
                return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}` === key;
              });
              const dayTasks = tasks.filter((t) => t.date === key);
              return (
                <div key={key}>
                  {spanDays > 1 && (
                    <h3 className="text-headline-md text-on-surface mb-2">
                      {d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </h3>
                  )}
                  <DayTimeline
                    day={d}
                    events={dayEvts}
                    tasks={dayTasks}
                    showCursor={dateKey(new Date()) === key}
                    nowMs={Date.now()}
                  />
                </div>
              );
            })}
          </div>
        </section>
        <div className="xl:col-span-3">
          <CalendarRail
            viewed={viewed}
            onSelectDay={(d) => {
              const base = startOfDay(new Date());
              setDayOffset(Math.round((startOfDay(d).getTime() - base.getTime()) / 86400000));
            }}
            taskDates={new Set(tasks.map((t) => t.date))}
            backlog={backlog}
            viewedEvents={dayEvents}
            viewedTasks={viewedTasks}
            onQuickAdd={() => setModalOpen(true)}
          />
        </div>
      </div>

      <NewTaskModal open={modalOpen} initial={null} onClose={() => setModalOpen(false)} />
    </div>
  );
}
