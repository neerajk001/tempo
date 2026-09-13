"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import SessionInspector from "@/components/history/SessionInspector";
import { useTaskStore, selectTaskById } from "@/stores/task-store";
import { useSessionHistoryStore, getRecordLabel, getSessionMode, type SessionRecord } from "@/stores/session-history-store";
import { formatDurationMinutes } from "@/lib/utils";
import type { FocusMode, PomodoroPhase } from "@/types";
import { cn } from "@/lib/utils";

type Range = "today" | "yesterday" | "week" | "custom";
type Group = "sessions" | "tasks" | "projects";

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
function phaseLabel(phase: PomodoroPhase): string {
  if (phase === "SHORT_BREAK") return "Short break";
  if (phase === "LONG_BREAK") return "Long break";
  return "Focus";
}
function modeLabel(mode: FocusMode): string {
  return mode === "infinite" ? "Infinite focus" : "Timed focus";
}
function fmtHM(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtShort(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function rangeBounds(range: Range, nav: number, customA: string, customB: string): { start: number; end: number; label: string } {
  const today = startOfDay(new Date()).getTime();
  const DAY = 86400000;
  if (range === "today") {
    const s = today + nav * DAY;
    return { start: s, end: s + DAY, label: new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
  }
  if (range === "yesterday") {
    const s = today + (nav - 1) * DAY;
    return { start: s, end: s + DAY, label: new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
  }
  if (range === "week") {
    const mon = mondayOf(new Date()).getTime() + nav * 7 * DAY;
    return {
      start: mon,
      end: mon + 7 * DAY,
      label: `${fmtShort(mon)} – ${fmtShort(mon + 6 * DAY)}, ${new Date(mon).getFullYear()}`,
    };
  }
  const a = customA ? new Date(`${customA}T00:00:00`).getTime() : today;
  const b = customB ? new Date(`${customB}T00:00:00`).getTime() + DAY : today + DAY;
  const s = Math.min(a, b);
  const e = Math.max(a, b);
  return { start: s, end: e, label: `${fmtShort(s)} – ${fmtShort(e)}` };
}

function toCSV(rows: SessionRecord[], taskTitleOf: (id: string | null) => string): string {
  const head = "date,task,session_name,session_type,window,focus_min,break_min,paused_min,interruptions,status";
  const lines = rows.map((r) => {
    const d = new Date(r.startedAt);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const win = `${fmtHM(r.startedAt)}-${fmtHM(r.endedAt)}`;
    const title = `"${(taskTitleOf(r.taskId) ?? r.taskTitle ?? "Focus Session").replace(/"/g, '""')}"`;
    const sname = `"${((r.sessionName ?? "").replace(/"/g, '""'))}"`;
    return [date, title, sname, getSessionMode(r), win, Math.round(r.focusedMs / 60000), Math.round((r.breakMs ?? 0) / 60000), Math.round(r.pausedMs / 60000), r.interruptions, r.status].join(",");
  });
  return [head, ...lines].join("\n");
}

const PAGE_SIZE = 10;

export default function HistoryClient() {
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [range, setRange] = useState<Range>("week");
  const [nav, setNav] = useState(0);
  const [customA, setCustomA] = useState(keyOf(new Date()));
  const [customB, setCustomB] = useState(keyOf(new Date()));
  const [group, setGroup] = useState<Group>("sessions");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all");
  const [metricsOn, setMetricsOn] = useState(true);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const bounds = rangeBounds(range, nav, customA, customB);
  useEffect(() => setPage(0), [range, nav, customA, customB, query, project, group]);
  useEffect(() => {
    setSelectedId((cur) => cur ?? sessions[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const taskOf = (id: string | null) => (id ? selectTaskById(tasks, id) : null);
  const titleOf = (id: string | null, fallback: string | null) => taskOf(id)?.title ?? fallback ?? "Focus Session";
  const labelOf = (r: SessionRecord) => getRecordLabel(r, titleOf(r.taskId, r.taskTitle));

  const projects = useMemo(() => {
    const arr: string[] = [];
    tasks.forEach((t) => {
      if (t.project && !arr.includes(t.project)) arr.push(t.project);
    });
    return arr.sort();
  }, [tasks]);

  const inRange = useMemo(
    () => sessions.filter((x) => x.startedAt >= bounds.start && x.startedAt < bounds.end).sort((a, b) => b.startedAt - a.startedAt),
    [sessions, bounds]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter((x) => {
      if (project !== "all") {
        const t = taskOf(x.taskId);
        if ((t?.project ?? "__none") !== project) return false;
      }
      if (q && !`${getRecordLabel(x, titleOf(x.taskId, x.taskTitle))}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRange, query, project, tasks]);

  // KPIs over filtered range
  const focus = filtered.filter((x) => x.phase === "FOCUS");
  const focusedMs = focus.reduce((s, x) => s + Math.max(0, x.focusedMs), 0);
  const pausedMs = filtered.reduce((s, x) => s + Math.max(0, x.pausedMs), 0);
  const interruptions = filtered.reduce((s, x) => s + x.interruptions, 0);
  const pomoDone = focus.filter((x) => x.status === "COMPLETED").length;
  const pomoTotal = focus.length;
  const intentional = pomoTotal > 0 ? Math.round((pomoDone / pomoTotal) * 1000) / 10 : 0;
  const avgSession = focus.length > 0 ? focusedMs / focus.length : 0;
  const days = Math.max(1, Math.round((bounds.end - bounds.start) / 86400000));
  const goalMin = days * 360;
  const adherence = goalMin > 0 ? Math.min(999, Math.round((focusedMs / 60000 / goalMin) * 100)) : 0;
  const prevStart = bounds.start - (bounds.end - bounds.start);
  const prevMs = sessions
    .filter((x) => x.phase === "FOCUS" && x.startedAt >= prevStart && x.startedAt < bounds.start)
    .reduce((s, x) => s + Math.max(0, x.focusedMs), 0);
  const deltaMin = Math.round((focusedMs - prevMs) / 60000);

  // Week distribution (Mon–Sun of viewed week)
  const weekStart = mondayOf(new Date(bounds.start));
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.getTime() + i * 86400000);
  const weekFocused = weekDays.map((d) =>
    sessions
      .filter((x) => x.phase === "FOCUS" && x.startedAt >= d && x.startedAt < d + 86400000)
      .reduce((s, x) => s + Math.max(0, x.focusedMs), 0)
  );
  const weekMax = Math.max(6 * 3600000, ...weekFocused);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visibleSessions = group === "sessions" ? filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE) : filtered;

  // Groupings
  const byDay = useMemo(() => {
    const map = new Map<string, SessionRecord[]>();
    visibleSessions.forEach((x) => {
      const k = keyOf(new Date(x.startedAt));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(x);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visibleSessions]);

  const byTask = useMemo(() => {
    const map = new Map<string, { title: string; project: string | null; list: SessionRecord[] }>();
    filtered.forEach((x) => {
      const t = taskOf(x.taskId);
      const k = x.taskId ?? `__untitled:${x.taskTitle ?? "session"}`;
      if (!map.has(k)) map.set(k, { title: t?.title ?? x.taskTitle ?? "Focus Session", project: t?.project ?? null, list: [] });
      map.get(k)!.list.push(x);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].list.length - a[1].list.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tasks]);

  const byProject = useMemo(() => {
    const map = new Map<string, SessionRecord[]>();
    filtered.forEach((x) => {
      const k = taskOf(x.taskId)?.project ?? "No project";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(x);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tasks]);

  const selected = sessions.find((x) => x.id === selectedId) ?? filtered[0] ?? null;

  const exportCSV = () => {
    const csv = toCSV(filtered, (id) => titleOf(id, null));
    const blob = new Blob([csv], { type: "text/csv" });
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
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tasks]);

  const dayLabel = (key: string): string => {
    const d = new Date(`${key}T00:00:00`);
    const todayK = keyOf(new Date());
    const yK = keyOf(new Date(Date.now() - 86400000));
    const prefix = key === todayK ? "Today" : key === yK ? "Yesterday" : "Earlier";
    return `${prefix} — ${d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-[280px]">
          <h1 className="text-headline-lg text-on-surface tracking-tight">History</h1>
          <p className="text-body-sm text-on-surface-variant">Every focus session you’ve tracked. Times are shown in your local time.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setMetricsOn((v) => !v)}
            aria-pressed={metricsOn}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-low shadow-sm transition-all text-body-sm font-medium"
          >
            <Icon name="tune" className="text-[16px] text-on-surface-variant" />
            <span>{metricsOn ? "Hide summary" : "Show summary"}</span>
          </button>
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-on-surface text-surface hover:brightness-110 shadow-sm transition-all text-body-sm font-medium"
          >
            <Icon name="file_download" className="text-[16px]" />
            <span>Download CSV</span>
            <span className="font-mono text-code-badge text-on-surface/70 ml-1">⌘E</span>
          </button>
        </div>
      </header>

      {/* Range + filters */}
      <section className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center p-0.5 rounded-lg bg-surface-container-low">
            {(["today", "yesterday", "week", "custom"] as Range[]).map((r) => {
              const label = r === "today" ? "Today" : r === "yesterday" ? "Yesterday" : r === "week" ? "Week" : "Custom";
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRange(r);
                    setNav(0);
                  }}
                  className={cn(
                    "px-3 py-0.5 rounded-md text-body-sm transition-colors",
                    range === r ? "bg-surface-container-lowest text-on-surface font-medium shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {range === "custom" ? (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customA} onChange={(e) => e.target.value && setCustomA(e.target.value)} className="h-8 rounded-lg bg-surface-container-low px-2 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary-container" />
              <span className="text-secondary">→</span>
              <input type="date" value={customB} onChange={(e) => e.target.value && setCustomB(e.target.value)} className="h-8 rounded-lg bg-surface-container-low px-2 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary-container" />
            </div>
          ) : (
            <div className="flex items-center gap-0.5 pl-1">
              <button type="button" title="Previous period" onClick={() => setNav((n) => n - 1)} className="p-0.5 rounded hover:bg-surface-container-low text-on-surface-variant transition-colors">
                <Icon name="chevron_left" className="text-[18px]" />
              </button>
              <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-md text-on-surface text-body-sm font-medium">
                <Icon name="calendar_month" className="text-[16px] text-primary" />
                {bounds.label}
              </span>
              <button
                type="button"
                title="Next period"
                onClick={() => setNav((n) => n + 1)}
                disabled={nav >= 0}
                className="p-0.5 rounded hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-40"
              >
                <Icon name="chevron_right" className="text-[18px]" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-0.5 rounded-lg bg-surface-container-low text-label-xs">
            <span className="px-1.5 text-on-surface-variant uppercase font-semibold">Group by</span>
            {(["sessions", "tasks", "projects"] as Group[]).map((g) => {
              const label = g === "sessions" ? "Sessions" : g === "tasks" ? "Tasks" : "Projects";
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={cn(
                    "px-3 py-0.5 rounded",
                    group === g ? "bg-surface-container-lowest text-on-surface font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="relative flex items-center min-w-[200px]">
            <Icon name="filter_list" className="absolute left-3 text-[16px] text-on-surface-variant pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by task or session"
              className="w-full h-8 pl-9 pr-3 bg-surface-container-low focus:bg-surface-container-lowest text-body-sm rounded-lg text-on-surface placeholder:text-on-surface-variant/70 transition-all outline-none focus:shadow-sm"
            />
          </div>
          <button
            type="button"
            title="Filter by project"
            onClick={() => {
              const opts = ["all", ...projects];
              setProject(opts[(opts.indexOf(project) + 1) % opts.length]);
            }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-body-sm transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-primary-container" />
            <span>{project === "all" ? "All projects" : project}</span>
            <Icon name="expand_more" className="text-[16px]" />
          </button>
        </div>
      </section>

      {/* KPIs */}
      {metricsOn && (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-medium">Focused time</span>
              <Icon name="timer" className="text-[18px] text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-mono text-metric-mono-lg text-on-surface tracking-tight tabular-nums">{formatDurationMinutes(Math.round(focusedMs / 60000))}</span>
              <span className="font-mono text-code-badge text-on-surface-variant">{adherence}% of a {formatDurationMinutes(goalMin)} goal</span>
            </div>
            <div className="flex items-center gap-1 text-label-xs text-on-primary-fixed">
              <Icon name={deltaMin >= 0 ? "trending_up" : "trending_down"} className="text-[14px]" />
              <span className="font-medium">{deltaMin >= 0 ? `+${formatDurationMinutes(deltaMin)}` : `−${formatDurationMinutes(-deltaMin)}`} vs last period</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, adherence)}%` }} />
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-medium">Focus sessions finished</span>
              <Icon name="check_circle" className="text-[18px] text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-metric-mono-lg text-on-surface tracking-tight tabular-nums">{pomoDone}</span>
              <span className="font-mono text-code-badge text-on-surface-variant">of {pomoTotal} started</span>
            </div>
            <div className="flex items-center gap-1 text-label-xs text-on-surface-variant">
              <Icon name="done_all" className="text-[14px] text-primary" />
              <span>{intentional}% reached the end</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, intentional)}%` }} />
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-medium">Interruptions</span>
              <Icon name="notifications_paused" className="text-[18px] text-accent-amber" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-metric-mono-lg text-on-surface tracking-tight tabular-nums">{interruptions}</span>
              <span className="font-mono text-code-badge text-on-accent-amber bg-accent-amber-container px-1 py-0.5 rounded">{formatDurationMinutes(Math.round(pausedMs / 60000))} paused</span>
            </div>
            <div className="flex items-center gap-1 text-label-xs text-on-surface-variant">
              <Icon name="info" className="text-[14px]" />
              <span>
                {interruptions > 0
                  ? `About ${(pausedMs / interruptions / 60000).toFixed(1)}m paused each time`
                  : "No pauses recorded"}
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container">
              <div className="h-full bg-accent-amber" style={{ width: `${Math.min(100, interruptions * 4)}%` }} />
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-medium">Average session</span>
              <Icon name="tune" className="text-[18px] text-accent-yellow" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-metric-mono-lg text-on-surface tracking-tight tabular-nums">{formatDurationMinutes(Math.round(avgSession / 60000))}</span>
              <span className="font-mono text-code-badge text-on-surface-variant">per session</span>
            </div>
            <div className="flex items-center gap-1 text-label-xs text-on-accent-yellow">
              <Icon name="verified" className="text-[14px]" />
              <span>{focus.length} focus session{focus.length === 1 ? "" : "s"} in this period</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container">
              <div className="h-full bg-accent-yellow" style={{ width: `${Math.min(100, Math.round((avgSession / 60000 / 55) * 100))}%` }} />
            </div>
          </div>
        </section>
      )}

      {/* Table + inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <div className="lg:col-span-7 flex flex-col gap-3 min-w-0">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden flex flex-col">
            <div className="hidden md:grid grid-cols-12 px-4 py-2 bg-surface-container-low text-[10px] font-medium text-on-surface-variant select-none">
              <div className="col-span-2">{group === "sessions" ? "Date" : "Sessions"}</div>
              <div className="col-span-4">{group === "sessions" ? "Task" : group === "tasks" ? "Task" : "Project"}</div>
              <div className="col-span-2 text-right">Time</div>
              <div className="col-span-1 text-right">Focused</div>
              <div className="col-span-1 text-right">Paused</div>
              <div className="col-span-1 text-right">Pauses</div>
              <div className="col-span-1 text-right">Open</div>
            </div>
            <div className="divide-y divide-surface-container-high/60">
              {group === "sessions" && byDay.length === 0 && (
                <p className="px-4 py-8 text-body-sm text-secondary">No sessions in this period yet. Start a focus session and it will show up here.</p>
              )}
              {group === "sessions" &&
                byDay.map(([key, list]) => {
                  const d = new Date(`${key}T00:00:00`);
                  const todayK = keyOf(new Date());
                  const prefix = key === todayK ? "Today" : key === keyOf(new Date(Date.now() - 86400000)) ? "Yesterday" : "Earlier";
                  const dayFocus = list.filter((x) => x.phase === "FOCUS").reduce((s, x) => s + Math.max(0, x.focusedMs), 0);
                  return (
                    <div key={key} className="flex flex-col">
                      <div className="px-4 py-1 bg-surface-container-low/60 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-label-xs font-semibold text-on-surface flex items-center gap-1.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full", key === todayK ? "bg-primary" : "bg-secondary-fixed-dim")} />
                          {prefix} — {d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span className="font-mono text-code-badge text-on-surface-variant">
                          {list.length} session{list.length === 1 ? "" : "s"} · {formatDurationMinutes(Math.round(dayFocus / 60000))} focused
                        </span>
                      </div>
                      {list.map((x) => {
                        const t = taskOf(x.taskId);
                        const active = selected?.id === x.id;
                        return (
                          <div
                            key={x.id}
                            onClick={() => setSelectedId(x.id)}
                            className={cn(
                              "flex flex-col gap-1.5 px-4 py-3 md:grid md:grid-cols-12 md:items-center md:py-2.5 cursor-pointer group transition-colors relative",
                              active ? "bg-primary-fixed/20" : "hover:bg-surface-container-low/80"
                            )}
                          >
                            {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                            <div className="font-mono text-code-badge text-on-surface-variant md:col-span-2">{fmtShort(x.startedAt)}<span className="md:hidden"> · {fmtHM(x.startedAt)} – {fmtHM(x.endedAt)}</span></div>
                            <div className="flex flex-col min-w-0 pr-1 md:col-span-4">
                              <span className={cn("text-body-sm truncate", active ? "font-semibold text-on-surface" : "font-medium text-on-surface")}>
                                {labelOf(x)}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {t?.project && (
                                  <span className={cn("px-1.5 py-px rounded font-mono text-[10px] leading-none", active ? "bg-primary-container text-on-primary" : "bg-primary-container/10 text-primary")}>
                                    {t.project}
                                  </span>
                                )}
                                <span className="text-[10px] text-on-surface-variant">{phaseLabel(x.phase)}</span>
                                <span className={cn(
                                  "font-mono text-[10px] px-1 py-px rounded font-medium",
                                  getSessionMode(x) === "infinite" ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container text-on-surface-variant"
                                )}>
                                  {modeLabel(getSessionMode(x))}
                                </span>
                                {(x.breakMs ?? 0) > 0 && (
                                  <span className="font-mono text-[10px] text-on-surface-variant">
                                    Break {formatDurationMinutes(Math.round((x.breakMs ?? 0) / 60000))}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="hidden md:block md:col-span-2 md:text-right font-mono text-metric-mono-md text-on-surface-variant">
                              {fmtHM(x.startedAt)} – {fmtHM(x.endedAt)}
                            </div>
                            <div className={cn("font-mono text-metric-mono-md md:col-span-1 md:text-right", active ? "text-primary font-semibold" : "text-on-surface font-medium")}>
                              <span className="md:hidden text-label-xs text-secondary font-normal mr-1.5">Focus</span>{formatDurationMinutes(Math.round(x.focusedMs / 60000))}
                            </div>
                            <div className="font-mono text-metric-mono-md text-on-surface-variant md:col-span-1 md:text-right">
                              <span className="md:hidden text-label-xs text-secondary font-normal mr-1.5">Paused</span>{formatDurationMinutes(Math.round(x.pausedMs / 60000))}
                            </div>
                            <div className="md:col-span-1 md:text-center">
                              <span className="md:hidden text-label-xs text-secondary font-normal mr-1.5">Interruptions</span>
                              <span className={cn(
                                "font-mono text-[11px] px-1.5 py-0.5 rounded font-medium",
                                x.interruptions === 0 ? "bg-primary-fixed text-on-primary-fixed" : "bg-accent-amber-container text-on-accent-amber"
                              )}>
                                {x.interruptions}
                              </span>
                            </div>
                            <div className="flex justify-end md:block md:col-span-1 md:text-right">
                              {active ? (
                                <span className="w-8 h-8 md:w-7 md:h-7 rounded inline-flex items-center justify-center bg-primary text-on-primary ml-auto shadow-sm">
                                  <Icon name="visibility" className="text-[16px]" />
                                </span>
                              ) : (
                                <Link
                                  href={`/history/${x.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-8 h-8 md:w-7 md:h-7 rounded inline-flex items-center justify-center text-on-surface-variant group-hover:bg-surface-container ml-auto transition-colors"
                                >
                                  <Icon name="chevron_right" className="text-[16px]" />
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              {group !== "sessions" &&
                (group === "tasks" ? byTask : byProject).map(([key, v]) => {
                  const list = group === "tasks" ? (v as { title: string; project: string | null; list: SessionRecord[] }).list : (v as SessionRecord[]);
                  const title = group === "tasks" ? (v as { title: string }).title : key;
                  const focused = list.filter((x) => x.phase === "FOCUS").reduce((s, x) => s + Math.max(0, x.focusedMs), 0);
                  const paused = list.reduce((s, x) => s + Math.max(0, x.pausedMs), 0);
                  const ints = list.reduce((s, x) => s + x.interruptions, 0);
                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedId(list[0]?.id ?? null)}
                      className="flex flex-col gap-1.5 px-4 py-3 md:grid md:grid-cols-12 md:items-center md:py-2.5 hover:bg-surface-container-low/80 cursor-pointer transition-colors"
                    >
                      <div className="font-mono text-code-badge text-on-surface-variant md:col-span-2">{list.length} session{list.length === 1 ? "" : "s"}</div>
                      <div className="text-body-sm font-medium text-on-surface truncate md:col-span-4">{title}</div>
                      <div className="hidden md:block md:col-span-2 md:text-right font-mono text-metric-mono-md text-on-surface-variant">—</div>
                      <div className="font-mono text-metric-mono-md text-on-surface font-medium md:col-span-1 md:text-right"><span className="md:hidden text-label-xs text-secondary font-normal mr-1.5">Focused</span>{formatDurationMinutes(Math.round(focused / 60000))}</div>
                      <div className="font-mono text-metric-mono-md text-on-surface-variant md:col-span-1 md:text-right"><span className="md:hidden text-label-xs text-secondary font-normal mr-1.5">Paused</span>{formatDurationMinutes(Math.round(paused / 60000))}</div>
                      <div className="md:col-span-1 md:text-center">
                        <span className="md:hidden text-label-xs text-secondary font-normal mr-1.5">Interruptions</span>
                        <span className={cn("font-mono text-[11px] px-1.5 py-0.5 rounded font-medium", ints === 0 ? "bg-primary-fixed text-on-primary-fixed" : "bg-accent-amber-container text-on-accent-amber")}>{ints}</span>
                      </div>
                      <div className="hidden md:block md:col-span-1 md:text-right text-on-surface-variant"><Icon name="chevron_right" className="text-[16px] inline" /></div>
                    </div>
                  );
                })}
              {group !== "sessions" && (group === "tasks" ? byTask.length === 0 : byProject.length === 0) && (
                <p className="px-4 py-8 text-body-sm text-secondary">No sessions to group in this period.</p>
              )}
            </div>
            {group === "sessions" && filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-1.5 bg-surface-container-low text-label-xs text-on-surface-variant">
                <span>Showing {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length} sessions</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-code-badge">Page {safePage + 1} of {pages}</span>
                  <button type="button" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)} className="p-2 md:p-1 rounded disabled:opacity-40 hover:bg-surface-container">
                    <Icon name="arrow_back" className="text-[14px]" />
                  </button>
                  <button type="button" disabled={safePage >= pages - 1} onClick={() => setPage((p) => p + 1)} className="p-2 md:p-1 rounded disabled:opacity-40 hover:bg-surface-container">
                    <Icon name="arrow_forward" className="text-[14px]" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Distribution */}
          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Icon name="analytics" className="text-[16px] text-primary" />
                <span className="text-headline-md text-on-surface">Focus by day</span>
              </div>
              <span className="text-label-xs text-on-surface-variant">Focused hours per day · 6h goal</span>
            </div>
            <div className="grid grid-cols-7 gap-2 items-end h-24 pt-2">
              {weekDays.map((d, i) => {
                const isToday = keyOf(new Date(d)) === keyOf(new Date());
                const h = Math.min(100, Math.round((weekFocused[i] / weekMax) * 100));
                return (
                  <div key={i} className="flex flex-col items-center gap-1 h-full justify-end group">
                    <div className={cn("w-full rounded-t flex items-end", isToday ? "bg-primary-fixed" : "bg-surface-container group-hover:bg-primary-fixed transition-colors")} style={{ height: `${Math.max(8, h)}%` }}>
                      <div className="w-full bg-primary/80 rounded-t" style={{ height: `${Math.max(10, Math.round(h * 0.85))}%` }} />
                    </div>
                    <span className={cn("font-mono text-[10px]", isToday ? "font-semibold text-primary" : "text-on-surface-variant")}>
                      {isToday ? "Today" : new Date(d).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Inspector */}
        <aside className="lg:col-span-5 lg:sticky lg:top-20">
          {selected ? (
            <SessionInspector record={selected} onClose={() => setSelectedId(null)} onDeleted={() => setSelectedId(filtered[0]?.id ?? null)} />
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6 text-body-sm text-secondary">
              Pick a session to see what happened.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
