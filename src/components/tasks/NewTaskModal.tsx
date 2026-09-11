"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import { countPlannedPomodoros, todayKey } from "@/lib/task-planning";
import { formatDurationMinutes } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_PROJECTS,
  useTaskStore,
  type Task,
} from "@/stores/task-store";
import type { TaskPriority } from "@/types";
import type { CalendarEvent } from "@/services/google-calendar";
import { cn } from "@/lib/utils";

const PRESETS = [120, 240, 360];
const FOCUS_OPTIONS = [15, 25, 50, 90];
const SHORT_BREAK_OPTIONS = [3, 5, 10, 15];
const LONG_BREAK_OPTIONS = [15, 20, 30, 45];
const INTERVAL_OPTIONS = [2, 3, 4, 5, 6];

function prettyDate(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (key === todayKey()) return `Today, ${label}`;
  return label;
}

export default function NewTaskModal({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial?: Task | null;
  onClose: () => void;
}) {
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const { status: authStatus } = useSession();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayKey());
  const [allocated, setAllocated] = useState(360);
  const [customHours, setCustomHours] = useState(1);
  const [customMins, setCustomMins] = useState(30);
  const [useCustom, setUseCustom] = useState(false);
  const [project, setProject] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [focusMinutes, setFocusMinutes] = useState(50);
  const [shortBreak, setShortBreak] = useState(10);
  const [longBreak, setLongBreak] = useState(30);
  const [longInterval, setLongInterval] = useState(4);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setTitle(initial.title);
      setDescription(initial.description);
      setDate(initial.date);
      setAllocated(initial.allocatedMinutes);
      setUseCustom(!PRESETS.includes(initial.allocatedMinutes));
      setCustomHours(Math.floor(initial.allocatedMinutes / 60));
      setCustomMins(initial.allocatedMinutes % 60);
      setProject(initial.project ?? "");
      setPriority(initial.priority ?? "medium");
      setFocusMinutes(initial.focusMinutes);
      setShortBreak(initial.shortBreakMinutes ?? 10);
      setLongBreak(initial.longBreakMinutes ?? 30);
      setLongInterval(initial.longBreakInterval ?? 4);
      setEventId(initial.calendarEventId ?? "");
    } else {
      setTitle("");
      setDescription("");
      setDate(todayKey());
      setAllocated(360);
      setUseCustom(false);
      setCustomHours(1);
      setCustomMins(30);
      setProject("");
      setPriority("medium");
      setFocusMinutes(50);
      setShortBreak(10);
      setLongBreak(30);
      setLongInterval(4);
      setEventId("");
    }
    setEvents(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open || authStatus !== "authenticated") return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    fetch(
      `/api/calendar/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`
    )
      .then(async (r) => {
        const data = (await r.json()) as { events?: CalendarEvent[] };
        if (!r.ok) return;
        setEvents((data.events ?? []).filter((e) => !e.allDay));
      })
      .catch(() => setEvents([]));
  }, [open, authStatus]);

  const effectiveAllocated = useCustom ? Math.round(customHours * 60 + customMins) : allocated;
  const cycles = useMemo(() => {
    try {
      return countPlannedPomodoros(Math.max(1, effectiveAllocated), focusMinutes);
    } catch {
      return 0;
    }
  }, [effectiveAllocated, focusMinutes]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, description, date, effectiveAllocated, focusMinutes, shortBreak, longBreak, longInterval, project, priority, eventId, initial]);

  if (!open) return null;

  const submit = () => {
    try {
      const linked = events?.find((e) => e.id === eventId);
      const payload = {
        title,
        description,
        date,
        allocatedMinutes: effectiveAllocated,
        focusMinutes,
        shortBreakMinutes: shortBreak,
        longBreakMinutes: longBreak,
        longBreakInterval: longInterval,
        project,
        priority,
        calendarEventId: linked?.id,
        startMs: linked?.startMs,
        endMs: linked?.endMs,
      };
      if (initial) updateTask(initial.id, payload);
      else createTask(payload);
      setError(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save task");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-surface-container-lowest rounded-xl shadow-xl border border-outline flex flex-col overflow-hidden max-h-[90vh] animate-rise">
        <div className="flex items-start justify-between px-6 pt-4 pb-3 border-b border-outline-variant/20 bg-surface-container-low/40">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-headline-md text-[18px] font-semibold text-on-surface tracking-tight">
                {initial ? "Edit Task" : "New Task"}
              </span>
              <span className="font-mono text-code-badge bg-primary-fixed text-on-primary-fixed font-medium px-1.5 py-0.5 rounded">Focus Block</span>
            </div>
            <span className="text-body-sm text-[12px] text-on-surface-variant mt-0.5">Define what you want to accomplish.</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="font-mono text-label-xs text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/30">Esc</kbd>
            <button type="button" onClick={onClose} className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-1">
            <label className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
              <span>Task Name</span>
              <span className="font-normal text-on-surface-variant/70">Required</span>
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you working on?"
              className="w-full h-9 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/60 text-body-md border border-outline-variant/30 focus:border-primary-container focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary-container transition-all"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes, acceptance criteria, or key constraints..."
              rows={2}
              className="w-full p-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/60 text-body-sm border border-outline-variant/30 focus:border-primary-container focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary-container transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">Date</label>
              <div className="relative">
                <Icon name="calendar_today" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary text-[16px] pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="w-full h-9 pl-9 pr-8 rounded-lg bg-surface-container-low border border-outline-variant/30 text-on-surface text-body-sm focus:border-primary-container focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary-container transition-all"
                />
                <Icon name="unfold_more" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none" />
              </div>
              <span className="text-label-xs text-secondary">{prettyDate(date)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">Allocated Time</label>
                <span className="font-mono text-label-xs text-primary font-semibold">{formatDurationMinutes(Math.max(1, effectiveAllocated))} total</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setAllocated(p);
                      setUseCustom(false);
                    }}
                    className={cn(
                      "h-9 rounded-lg font-mono text-label-xs font-medium transition-colors border border-outline-variant/20",
                      !useCustom && allocated === p ? "bg-primary-container text-on-primary font-semibold shadow-sm" : "bg-surface-container-low hover:bg-surface-container text-on-surface"
                    )}
                  >
                    {formatDurationMinutes(p)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setUseCustom(true)}
                  className={cn(
                    "h-9 rounded-lg font-mono text-label-xs transition-colors border border-outline-variant/20 flex items-center justify-center gap-0.5",
                    useCustom ? "bg-primary-container text-on-primary font-semibold shadow-sm" : "bg-surface-container-low hover:bg-surface-container text-on-surface-variant"
                  )}
                >
                  <span>Custom</span>
                </button>
              </div>
              {useCustom && (
                <div className="flex gap-1.5">
                  <label className="flex-1 text-body-sm text-secondary flex items-center gap-1.5">
                    <input type="number" min={0} max={24} value={customHours} onChange={(e) => setCustomHours(Number(e.target.value))} className="h-8 w-full rounded-lg bg-surface-container-low px-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container" />
                    h
                  </label>
                  <label className="flex-1 text-body-sm text-secondary flex items-center gap-1.5">
                    <input type="number" min={0} max={59} value={customMins} onChange={(e) => setCustomMins(Number(e.target.value))} className="h-8 w-full rounded-lg bg-surface-container-low px-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container" />
                    m
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">Project / Scope</label>
            <div className="flex gap-1.5">
              <select
                value={TASK_PROJECTS.includes(project as (typeof TASK_PROJECTS)[number]) ? project : ""}
                onChange={(e) => setProject(e.target.value)}
                className="h-9 rounded-lg bg-surface-container-low px-2 text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container"
              >
                <option value="">Custom…</option>
                {TASK_PROJECTS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Project name"
                className="h-9 flex-1 min-w-0 rounded-lg bg-surface-container-low px-3 text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary-container"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">Priority</label>
            <div className="flex gap-1.5">
              {TASK_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    "h-8 px-3 rounded-lg text-body-sm font-medium capitalize transition-colors",
                    priority === p ? "bg-primary text-on-primary font-semibold" : "bg-surface-container-low text-secondary hover:text-on-surface"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/30 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-on-surface text-body-sm">
                <Icon name="timer" className="text-[16px] text-primary" />
                <span className="font-medium text-[13px]">Pomodoro Rhythm & Cadence</span>
              </div>
              <span className="font-mono text-label-xs text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20">
                {cycles} Cycles / Round
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <label className="flex flex-col p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Focus Window</span>
                <select value={focusMinutes} onChange={(e) => setFocusMinutes(Number(e.target.value))} className="mt-0.5 font-mono text-body-sm font-semibold text-on-surface bg-transparent focus:outline-none">
                  {FOCUS_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}m</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Short Break</span>
                <select value={shortBreak} onChange={(e) => setShortBreak(Number(e.target.value))} className="mt-0.5 font-mono text-body-sm font-semibold text-on-surface bg-transparent focus:outline-none cursor-pointer">
                  {SHORT_BREAK_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}m</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Long Break</span>
                <div className="flex items-center justify-between mt-0.5 gap-1">
                  <select value={longBreak} onChange={(e) => setLongBreak(Number(e.target.value))} className="font-mono text-body-sm font-semibold text-on-surface bg-transparent focus:outline-none cursor-pointer">
                    {LONG_BREAK_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}m</option>
                    ))}
                  </select>
                  <select
                    value={longInterval}
                    onChange={(e) => setLongInterval(Number(e.target.value))}
                    title="Sessions before long break"
                    className="text-label-xs text-on-surface-variant font-normal bg-transparent focus:outline-none cursor-pointer"
                  >
                    {INTERVAL_OPTIONS.map((n) => (
                      <option key={n} value={n}>after {n}</option>
                    ))}
                  </select>
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold flex items-center gap-1">
                <Icon name="event" className="text-[14px] text-tertiary" />
                <span>Link Calendar Event (Optional)</span>
              </label>
              {authStatus === "authenticated" && (
                <span className="text-label-xs text-primary font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Calendar ready
                </span>
              )}
            </div>
            {authStatus === "authenticated" ? (
              <div className="relative">
                <Icon name="calendar_month" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none" />
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full h-9 pl-9 pr-8 rounded-lg bg-surface-container-low text-on-surface text-body-sm border border-outline-variant/30 focus:border-primary-container focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary-container appearance-none transition-all cursor-pointer"
                >
                  <option value="">Do not link to calendar</option>
                  {(events ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({new Date(e.startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })} — {new Date(e.endMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })})
                    </option>
                  ))}
                </select>
                <Icon name="unfold_more" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none" />
              </div>
            ) : (
              <p className="text-body-sm text-secondary">
                Sign in to link a calendar event — <a href="/calendar" className="underline">Connect</a>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary-container/40 border border-outline-variant/20">
            <div className="flex items-center gap-1.5">
              <span className="text-label-xs text-on-surface-variant uppercase tracking-wider font-semibold">Allocated:</span>
              <span className="font-mono text-body-sm font-semibold text-on-surface">{formatDurationMinutes(Math.max(1, effectiveAllocated))}</span>
              <span className="text-outline-variant">•</span>
              <span className="text-label-xs text-on-surface-variant uppercase tracking-wider font-semibold">Est. Pomodoros:</span>
              <span className="font-mono text-body-sm font-semibold text-primary">{cycles} Blocks</span>
            </div>
            <div className="flex items-center gap-1.5" title={`${cycles} planned focus intervals`}>
              {Array.from({ length: Math.min(cycles, 7) }).map((_, i) => (
                <span key={i} className={cn("w-2.5 h-2.5 rounded-full", i < Math.min(cycles, 4) ? "bg-primary" : "bg-primary/40")} />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-surface-container-low/50 border-t border-outline-variant/20">
          <span className="text-body-sm text-[12px] text-on-surface-variant hidden sm:inline">
            Press <kbd className="font-mono text-label-xs text-on-surface bg-surface-container px-1 py-0.5 rounded border border-outline-variant/30">⌘Enter</kbd> to create, <kbd className="font-mono text-label-xs text-on-surface bg-surface-container px-1 py-0.5 rounded border border-outline-variant/30">Esc</kbd> to cancel
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onClose} className="h-8 px-4 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-body-sm font-medium transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary-container text-on-primary hover:bg-primary shadow-sm text-body-sm font-medium transition-colors"
            >
              <Icon name="check" className="text-[16px]" />
              <span>{initial ? "Save Changes" : "Create Task"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
