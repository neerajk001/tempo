"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import NewTaskModal from "@/components/tasks/NewTaskModal";
import { TaskRow, sortTasks } from "@/components/tasks/TaskTable";
import { computeDashboardStats, localDateKey } from "@/lib/dashboard-stats";
import { todayKey } from "@/lib/task-planning";
import { calendarEventToTaskDraft, type CalendarEvent } from "@/services/google-calendar";
import { formatDurationMinutes } from "@/lib/utils";
import { useTaskStore, type Task } from "@/stores/task-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import type { TaskStatus } from "@/types";
import { cn } from "@/lib/utils";

type Tab = "today" | "upcoming" | "completed";
type Source = "all" | "calendar" | "manual";
type Sort = "priority" | "allocated" | "newest";

const SOURCES: Array<{ id: Source; label: (n: number) => string }> = [
  { id: "all", label: (n) => `Source: All (${n})` },
  { id: "calendar", label: () => "Source: Calendar" },
  { id: "manual", label: () => "Source: Manual" },
];
const STATUSES: Array<{ id: TaskStatus | "all"; label: string }> = [
  { id: "all", label: "Status: All" },
  { id: "TODO", label: "Status: Todo" },
  { id: "IN_PROGRESS", label: "Status: Active" },
  { id: "COMPLETED", label: "Status: Done" },
  { id: "CANCELLED", label: "Status: Cancelled" },
];
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "priority", label: "Priority: High to Low" },
  { id: "allocated", label: "Allocation: High to Low" },
  { id: "newest", label: "Newest First" },
];

export default function TasksPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[] | null>(null);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const loadUpcomingEvents = async () => {
    // From right now through the next 7 days — tonight's remaining events count.
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    setUpcomingLoading(true);
    setUpcomingError(null);
    try {
      const res = await fetch(
        `/api/calendar/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`
      );
      const data = (await res.json()) as { events?: CalendarEvent[]; error?: string };
      if (!res.ok) {
        setUpcomingError(data.error ?? "Calendar unavailable.");
        setUpcomingEvents([]);
        return;
      }
      setUpcomingEvents((data.events ?? []).filter((e) => !e.allDay && e.endMs > start.getTime()).sort((a, b) => a.startMs - b.startMs));
    } catch {
      setUpcomingError("Calendar unavailable. Local tasks keep working.");
      setUpcomingEvents([]);
    } finally {
      setUpcomingLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setUpcomingEvents(null);
      setUpcomingError(null);
      return;
    }
    void loadUpcomingEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const timerTaskId = usePomodoroStore((s) => s.activeTaskId);
  const timerRunning = usePomodoroStore((s) => s.session.status === "RUNNING" || s.session.status === "PAUSED");
  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [sort, setSort] = useState<Sort>("priority");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        router.push("/calendar");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (modalOpen) return; // modal owns Esc / ⌘↵
      if ((e.key === "c" || e.key === "C") && !inField) {
        e.preventDefault();
        setEditing(null);
        setModalOpen(true);
      } else if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, router]);

  const today = todayKey();
  const stats = useMemo(() => computeDashboardStats(tasks, sessions, today), [tasks, sessions, today]);
  const counts = useMemo(
    () => ({
      today: tasks.filter((t) => t.date === today && t.status !== "COMPLETED" && t.status !== "CANCELLED").length,
      upcoming: tasks.filter((t) => t.date > today && t.status !== "COMPLETED" && t.status !== "CANCELLED").length,
      completed: tasks.filter((t) => t.status === "COMPLETED").length,
    }),
    [tasks, today]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tasks.filter((t) => {
      // The task with a live timer is always visible in Today — never strand a running session.
      const live = timerRunning && t.id === timerTaskId;
      if (tab === "today" && (t.date !== today || (!live && (t.status === "COMPLETED" || t.status === "CANCELLED")))) return false;
      if (tab === "upcoming" && (t.date <= today || t.status === "COMPLETED" || t.status === "CANCELLED")) return false;
      if (tab === "completed" && t.status !== "COMPLETED") return false;
      if (source === "calendar" && !t.calendarEventId) return false;
      if (source === "manual" && t.calendarEventId) return false;
      if (status !== "all" && t.status !== status) return false;
      if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list = sortTasks(list, sort === "newest" ? "newest" : sort);
    return list;
  }, [tasks, tab, today, source, status, query, sort, timerTaskId, timerRunning]);

  const todayList = tab === "today" ? filtered : [];
  const upcomingList = useMemo(
    () => sortTasks(tasks.filter((t) => t.date > today && t.status !== "COMPLETED" && t.status !== "CANCELLED"), "newest"),
    [tasks, today]
  );
  const upcomingAllocated = upcomingList.reduce((s, t) => s + t.allocatedMinutes, 0);

  // Upcoming Google Calendar events (next 7 days): timing + allotted hours,
  // plannable in one click. Explicit fetch only — no background polling.
  const createTask = useTaskStore((s) => s.createTask);
  useEffect(() => {
    if (authStatus !== "authenticated") {
      setUpcomingEvents(null);
      setUpcomingError(null);
      return;
    }
    void loadUpcomingEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  const plannedEventIds = useMemo(() => new Set(tasks.map((t) => t.calendarEventId).filter(Boolean)), [tasks]);
  const unplannedEvents = useMemo(
    () => (upcomingEvents ?? []).filter((e) => !plannedEventIds.has(e.id)).slice(0, 5),
    [upcomingEvents, plannedEventIds]
  );

  const planEventAsTask = async (e: CalendarEvent) => {
    const draft = calendarEventToTaskDraft(e);
    createTask({ ...draft, focusMinutes: 50, startMs: e.startMs, endMs: e.endMs });
    try {
      await fetch("/api/calendar/to-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: e }),
      });
    } catch {
      // Local task already created — server sync is best-effort.
    }
  };
  const todayPlanned = todayList.reduce((s, t) => s + t.allocatedMinutes, 0);
  const todayFocused = todayList.reduce((s, t) => s + t.focusedMinutes, 0);
  const yesterdayKey = localDateKey(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayFocused = sessions
    .filter((x) => x.phase === "FOCUS" && localDateKey(x.startedAt) === yesterdayKey)
    .reduce((s, x) => s + Math.max(0, x.focusedMs), 0);
  const delta =
    yesterdayFocused > 0
      ? Math.round(((stats.focusedMinutes * 60000 - yesterdayFocused) / yesterdayFocused) * 1000) / 10
      : null;

  const now = Date.now();
  const activeCount = tasks.filter((t) => t.date === today && (t.status === "IN_PROGRESS" || t.status === "TODO")).length;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-label-xs text-on-surface-variant uppercase tracking-wider mb-0.5">
            <span>Workspaces</span>
            <span className="text-outline-variant">/</span>
            <span className="text-primary font-semibold">Tasks</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-display-xl text-on-surface tracking-tight">Tasks</h1>
            <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono text-label-xs font-medium shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container animate-pulse" />
              <span>{activeCount} Active Today</span>
            </div>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Plan the work you want to focus on. Orchestrate high-cadence time blocks and Pomodoro intervals.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors shadow-sm text-body-sm font-medium"
          >
            <Icon name="save_as" className="text-[16px] text-tertiary" />
            <span>Import Calendar</span>
            <kbd className="ml-0.5 font-mono text-label-xs text-on-surface-variant px-1 rounded bg-surface-container">⌘I</kbd>
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors shadow-sm text-body-sm font-medium"
          >
            <Icon name="add" className="text-[16px]" />
            <span>New Task</span>
            <kbd className="ml-0.5 font-mono text-label-xs text-on-primary px-1 rounded bg-black/15">C</kbd>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 p-3 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant">
        <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container-low self-start">
          {(
            [
              { id: "today", label: "Today", n: counts.today },
              { id: "upcoming", label: "Upcoming", n: counts.upcoming },
              { id: "completed", label: "Completed", n: counts.completed },
            ] as Array<{ id: Tab; label: string; n: number }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md transition-colors",
                tab === t.id
                  ? "bg-surface-container-lowest text-on-surface text-body-sm font-semibold shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface text-body-sm"
              )}
            >
              <span>{t.label}</span>
              <span className="font-mono text-label-xs font-semibold px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-1 xl:justify-end">
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tasks or search keywords... (/)"
              className="w-full h-8 pl-8 pr-10 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/70 text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary-container transition-all"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-label-xs text-on-surface-variant bg-surface-container-high px-1 py-0.5 rounded">/</kbd>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Filter by source"
              onClick={() => setSource(SOURCES[(SOURCES.findIndex((s) => s.id === source) + 1) % SOURCES.length].id)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-primary-container" />
              <span>{SOURCES.find((s) => s.id === source)!.label(tasks.filter((t) => (source === "all" ? true : source === "calendar" ? !!t.calendarEventId : !t.calendarEventId)).length)}</span>
              <Icon name="expand_more" className="text-[14px] text-on-surface-variant" />
            </button>
            <button
              type="button"
              title="Filter by status"
              onClick={() => setStatus(STATUSES[(STATUSES.findIndex((s) => s.id === status) + 1) % STATUSES.length].id)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm transition-colors"
            >
              <span>{STATUSES.find((s) => s.id === status)!.label}</span>
              <Icon name="expand_more" className="text-[14px] text-on-surface-variant" />
            </button>
            <button
              type="button"
              title="Change sort"
              onClick={() => setSort(SORTS[(SORTS.findIndex((s) => s.id === sort) + 1) % SORTS.length].id)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm transition-colors"
            >
              <Icon name="sort" className="text-[14px] text-tertiary" />
              <span>{SORTS.find((s) => s.id === sort)!.label}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Planned Today", value: `${String(Math.floor(stats.plannedMinutes / 60)).padStart(2, "0")}h ${String(stats.plannedMinutes % 60).padStart(2, "0")}m`, icon: "timelapse", accent: false },
          { label: "Focused Deep Work", value: `${String(Math.floor(stats.focusedMinutes / 60)).padStart(2, "0")}h ${String(stats.focusedMinutes % 60).padStart(2, "0")}m`, icon: "bolt", accent: true },
          { label: "Remaining Horizon", value: `${String(Math.floor(stats.remainingMinutes / 60)).padStart(2, "0")}h ${String(stats.remainingMinutes % 60).padStart(2, "0")}m`, icon: "hourglass_top", accent: false },
        ].map((m) => (
          <div key={m.label} className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="text-label-xs text-on-surface-variant uppercase tracking-wider">{m.label}</span>
              <span className={cn("font-mono text-metric-mono-lg mt-0.5 tabular-nums", m.accent ? "text-primary font-semibold" : "text-on-surface")}>{m.value}</span>
            </div>
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", m.accent ? "bg-primary-fixed text-on-primary-fixed-variant" : m.icon === "timelapse" ? "bg-secondary-container text-on-secondary-fixed" : "bg-surface-container-high text-on-surface-variant")}>
              <Icon name={m.icon} className="text-[20px]" />
            </div>
          </div>
        ))}
        <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-label-xs text-on-surface-variant uppercase tracking-wider">Focus Efficiency</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-metric-mono-lg text-on-surface tabular-nums">{stats.focusRate.toFixed(1)}%</span>
              {delta !== null && (
                <span className="font-mono text-label-xs text-tertiary font-semibold flex items-center">
                  <Icon name="arrow_upward" className="text-[14px]" />{Math.abs(delta)}%
                </span>
              )}
            </div>
          </div>
          <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <path className="text-surface-container-high" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" />
              <path className="text-primary-container" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${stats.focusRate}, 100`} strokeLinecap="round" strokeWidth="3.5" />
            </svg>
            <Icon name="donut_large" className="absolute text-[14px] text-primary-container" />
          </div>
        </div>
      </div>

      {/* Today group */}
      {(tab === "today" || (tab !== "upcoming" && tab !== "completed")) && (
        <div className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-surface-container-low/70">
            <div className="flex items-center gap-2.5">
              <span className="text-on-surface-variant"><Icon name="keyboard_arrow_down" className="text-[18px]" /></span>
              <span className="text-headline-md text-on-surface">Today</span>
              <span className="font-mono text-code-badge font-semibold px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed">
                {todayList.length} TASKS
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-on-surface-variant font-mono text-body-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary-container" />
                <span className="text-on-surface font-medium">{formatDurationMinutes(todayPlanned)}</span> planned
              </div>
              <span className="text-outline-variant">•</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-tertiary-container" />
                <span className="text-on-surface font-medium">{formatDurationMinutes(todayFocused)}</span> focused
              </div>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 sm:px-6 py-1.5 bg-surface-container-low/30 text-label-xs text-on-surface-variant uppercase tracking-wider font-semibold">
            <div className="col-span-4"><span className="pl-1">Task Name</span></div>
            <div className="col-span-2"><span>Project</span></div>
            <div className="col-span-2"><span>Allocation & Progress</span></div>
            <div className="col-span-1 text-center"><span>Priority</span></div>
            <div className="col-span-1 text-center"><span>Status</span></div>
            <div className="col-span-2 text-right"><span className="pr-1">Action</span></div>
          </div>
          {todayList.length === 0 ? (
            <div className="px-6 py-8 text-body-sm text-secondary">
              No tasks match. <button type="button" onClick={openCreate} className="underline">Create one</button> or sync your calendar.
            </div>
          ) : (
            <div className="divide-y divide-surface-container-high/40">
              {todayList.map((t) => (
                <TaskRow key={t.id} task={t} now={now} onEdit={(x) => { setEditing(x); setModalOpen(true); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed group */}
      {tab === "completed" && (
        <div className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-surface-container-low/70">
            <div className="flex items-center gap-2.5">
              <span className="text-headline-md text-on-surface">Completed</span>
              <span className="font-mono text-code-badge font-semibold px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                {filtered.length} TASKS
              </span>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="px-6 py-8 text-body-sm text-secondary">Nothing completed yet. Finish a focus block to log it here.</div>
          ) : (
            <div className="divide-y divide-surface-container-high/40">
              {filtered.map((t) => (
                <TaskRow key={t.id} task={t} now={now} onEdit={(x) => { setEditing(x); setModalOpen(true); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming group */}
      {tab !== "completed" && (
        <div className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden">
          <button type="button" onClick={() => setUpcomingOpen((v) => !v)} className="flex items-center justify-between px-4 sm:px-6 py-4 bg-surface-container-low/70">
            <div className="flex items-center gap-2.5">
              <span className="text-on-surface-variant"><Icon name={upcomingOpen ? "keyboard_arrow_down" : "keyboard_arrow_right"} className="text-[18px]" /></span>
              <span className="text-headline-md text-on-surface">Upcoming</span>
              <span className="font-mono text-code-badge font-semibold px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                {upcomingList.length} TASKS
              </span>
            </div>
            <div className="flex items-center gap-2 text-on-surface-variant font-mono text-body-sm">
              <span>{formatDurationMinutes(upcomingAllocated)} allocated total</span>
              <Icon name="unfold_more" className="text-[18px] text-outline" />
            </div>
          </button>
          {upcomingList.length > 0 && (
            <div className="divide-y divide-surface-container-high/40">
              {(upcomingOpen ? upcomingList : upcomingList.slice(0, 2)).map((t) =>
                upcomingOpen ? (
                  <TaskRow key={t.id} task={t} now={now} onEdit={(x) => { setEditing(x); setModalOpen(true); }} />
                ) : (
                  <div key={t.id} className="grid grid-cols-12 gap-2 items-center px-4 sm:px-6 py-2.5 opacity-75 hover:opacity-100 hover:bg-surface-container-low/40 transition-all">
                    <div className="col-span-6 md:col-span-5 flex items-center gap-2.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-outline-variant flex-shrink-0" />
                      <span className="text-body-md text-on-surface font-medium truncate">{t.title}</span>
                    </div>
                    <div className="hidden md:flex md:col-span-3 items-center min-w-0">
                      {t.project && (
                        <span className="text-label-xs px-2 py-0.5 rounded bg-surface-container text-on-surface-variant truncate">{t.project}</span>
                      )}
                    </div>
                    <div className="col-span-3 md:col-span-2 font-mono text-label-xs text-on-surface-variant truncate">
                      {new Date(`${t.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} • {formatDurationMinutes(t.allocatedMinutes)}
                    </div>
                    <div className="col-span-3 md:col-span-2 flex justify-end">
                      <button type="button" onClick={() => { setEditing(t); setModalOpen(true); }} className="p-2 md:p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
                        <Icon name="chevron_right" className="text-[16px]" />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
          {authStatus !== "authenticated" ? (
            <div className="border-t border-surface-container-high/40">
              <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
                <span className="text-body-sm text-secondary">Connect Google Calendar to pull upcoming events here.</span>
                <Link href="/calendar" className="text-body-sm font-medium text-primary underline shrink-0">Connect</Link>
              </div>
            </div>
          ) : upcomingLoading && upcomingEvents === null ? (
            <div className="border-t border-surface-container-high/40">
              <div className="px-4 sm:px-6 py-3 text-body-sm text-secondary">Checking Google Calendar…</div>
            </div>
          ) : upcomingError ? (
            <div className="border-t border-surface-container-high/40">
              <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
                <span className="text-body-sm text-secondary">{upcomingError}</span>
                <button
                  type="button"
                  onClick={() => void loadUpcomingEvents()}
                  className="text-body-sm font-medium text-primary underline shrink-0"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : unplannedEvents.length === 0 ? (
            <div className="border-t border-surface-container-high/40">
              <div className="px-4 sm:px-6 py-3 text-body-sm text-secondary">No upcoming Google events in the next 7 days.</div>
            </div>
          ) : (
            <div className="border-t border-surface-container-high/40">
              <div className="px-4 sm:px-6 pt-3 pb-1 flex items-center gap-1.5">
                <Icon name="event" className="text-[14px] text-tertiary" />
                <span className="text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  From Google Calendar — plan with one click
                </span>
              </div>
              <div className="divide-y divide-surface-container-high/40">
                {unplannedEvents.map((e) => {
                  const mins = Math.max(1, Math.ceil((e.endMs - e.startMs) / 60000));
                  const f = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
                  return (
                    <div key={e.id} className="grid grid-cols-12 gap-2 items-center px-4 sm:px-6 py-2.5 hover:bg-surface-container-low/40 transition-all">
                      <div className="col-span-6 md:col-span-5 flex items-center gap-2.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary flex-shrink-0" />
                        <span className="text-body-md text-on-surface font-medium truncate">{e.title}</span>
                      </div>
                      <div className="hidden md:flex md:col-span-3 items-center">
                        <span className="text-label-xs px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
                          {new Date(e.startMs).toLocaleDateString("en-US", { month: "short", day: "numeric" })} • {f(e.startMs)} — {f(e.endMs)}
                        </span>
                      </div>
                      <div className="col-span-3 md:col-span-2 font-mono text-label-xs text-on-surface-variant">
                        {formatDurationMinutes(mins)} allotted
                      </div>
                      <div className="col-span-3 md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => planEventAsTask(e)}
                          className="inline-flex items-center gap-1 h-8 sm:h-7 px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-body-sm font-medium transition-colors"
                        >
                          <Icon name="add" className="text-[14px]" />
                          <span>Plan{` `}<span className="hidden sm:inline">as Task</span></span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-xl bg-surface-container-low shadow-sm border border-outline-variant">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface-container-lowest hidden sm:flex items-center justify-center text-primary shadow-sm">
            <Icon name="event_repeat" className="text-[24px]" />
          </div>
          <div className="flex flex-col">
            <span className="text-headline-md text-on-surface">Synchronize External Schedules</span>
            <span className="text-body-sm text-on-surface-variant">
              No more fragmented focus. Auto-block focus intervals directly from Google Calendar.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/calendar" className="h-8 px-4 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container text-body-sm font-medium shadow-sm transition-colors inline-flex items-center">
            Connect Calendar
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="h-8 px-4 rounded-lg bg-primary-container text-on-primary hover:bg-primary text-body-sm font-medium shadow-sm transition-colors"
          >
            Quick Add Task
          </button>
        </div>
      </div>

      <NewTaskModal open={modalOpen} initial={editing} onClose={() => { setModalOpen(false); setEditing(null); }} />
    </div>
  );
}
