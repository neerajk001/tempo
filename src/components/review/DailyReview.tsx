"use client";

import { useEffect, useMemo, useState } from "react";import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { computeDashboardStats, localDateKey } from "@/lib/dashboard-stats";
import { countPlannedPomodoros } from "@/lib/task-planning";
import { useTaskStore } from "@/stores/task-store";
import { useSessionHistoryStore, type SessionRecord } from "@/stores/session-history-store";
import { formatDurationMinutes } from "@/lib/utils";
import { cn } from "@/lib/utils";

function fmtHM(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DailyReview() {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [dayOffset, setDayOffset] = useState(0);

  const viewedMs = Date.now() + dayOffset * 86400000;
  const viewedKey = localDateKey(viewedMs);
  const viewedDate = useMemo(() => new Date(viewedMs), [viewedMs]);

  const stats = useMemo(() => computeDashboardStats(tasks, sessions, viewedKey), [tasks, sessions, viewedKey]);
  const dayTasks = useMemo(() => tasks.filter((t) => t.date === viewedKey), [tasks, viewedKey]);
  const daySessions = useMemo(
    () => sessions.filter((x) => localDateKey(x.startedAt) === viewedKey).sort((a, b) => a.startedAt - b.startedAt),
    [sessions, viewedKey]
  );
  const focusSessions = daySessions.filter((x) => x.phase === "FOCUS");
  const pausedMs = daySessions.reduce((s, x) => s + Math.max(0, x.pausedMs), 0);
  const interruptions = daySessions.reduce((s, x) => s + x.interruptions, 0);
  const pomoDone = focusSessions.filter((x) => x.status === "COMPLETED").length;
  const pomoTotal = focusSessions.length;
  const intentional = pomoTotal > 0 ? Math.round((focusSessions.filter((x) => x.status === "COMPLETED").length / pomoTotal) * 100) : 0;
  const avgMs = pomoTotal > 0 ? focusSessions.reduce((s, x) => s + Math.max(0, x.focusedMs), 0) / pomoTotal : 0;
  const cadence = focusSessions.length > 0
    ? Math.round((focusSessions.filter((x) => { const m = x.focusedMs / 60000; return m >= 40 && m <= 60; }).length / focusSessions.length) * 100)
    : 0;
  const pausedMin = Math.round(pausedMs / 60000);
  const total = Math.max(1, stats.focusedMinutes + pausedMin);

  const adherence = stats.plannedMinutes > 0 ? Math.min(100, Math.round((stats.focusedMinutes / stats.plannedMinutes) * 100)) : 0;
  const variance = stats.focusedMinutes - stats.plannedMinutes;

  const longest = useMemo(() => {
    const clean = focusSessions.filter((x) => x.interruptions === 0).sort((a, b) => b.focusedMs - a.focusedMs)[0];
    return clean ?? null;
  }, [focusSessions]);

  const sequence = useMemo(() => {
    type Entry = { at: number; kind: "focus" | "break"; title: string; sub: string; minutes: number };
    const list: Entry[] = daySessions.map((x) => ({
      at: x.startedAt,
      kind: x.phase === "FOCUS" ? ("focus" as const) : ("break" as const),
      title: x.phase === "FOCUS" ? `Focus: ${(x.taskTitle ?? "Deep Work").split(" ").slice(0, 4).join(" ")}` : "Rest Break",
      sub: x.phase === "FOCUS"
        ? `${x.interruptions === 0 ? "0 interruptions" : `${x.interruptions} interruption${x.interruptions === 1 ? "" : "s"}`} · ${Math.round((x.focusedMs / Math.max(1, x.plannedMs)) * 100)}% flow`
        : "Hydration & physical movement",
      minutes: Math.round(x.focusedMs / 60000),
    }));
    return list.sort((a, b) => a.at - b.at);
  }, [daySessions]);

  const firstStart = daySessions[0]?.startedAt ?? null;
  const lastEnd = daySessions.length > 0 ? daySessions[daySessions.length - 1].endedAt : null;
  const midLabel =
    firstStart !== null && lastEnd !== null && lastEnd > firstStart
      ? new Date(firstStart + (lastEnd - firstStart) / 2).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
      : "MIDDAY";

  const tomorrowKey = localDateKey(Date.now() + (dayOffset + 1) * 86400000);
  const tomorrowTasks = tasks.filter((t) => t.date === tomorrowKey).slice(0, 3);
  const tomorrowPlanned = tasks.filter((t) => t.date === tomorrowKey).reduce((s, t) => s + t.allocatedMinutes, 0);
  const tomorrowLabel = new Date(Date.now() + (dayOffset + 1) * 86400000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const exportSummary = () => {
    const lines = [
      `# Daily Review — ${viewedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}`,
      ``,
      `- Focus: ${formatDurationMinutes(stats.focusedMinutes)} of ${formatDurationMinutes(stats.plannedMinutes)} planned (${adherence}%)`,
      `- Pomodoros: ${pomoDone} completed · Interruptions: ${interruptions} · Paused: ${formatDurationMinutes(pausedMin)}`,
      ``,
      `## Tasks`,
      ...stats.perTask.map((t) => `- ${t.title}: ${formatDurationMinutes(t.actualMinutes)} / ${formatDurationMinutes(t.plannedMinutes)} (${t.percent}%)`),
    ];
    download(`tempo-review-${viewedKey}.md`, lines.join("\n"), "text/markdown");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        exportSummary();
      } else if (e.key === "Escape") {
        router.push("/");
      } else if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey) {
        router.push("/plan");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, tasks, viewedKey]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 font-mono text-code-badge text-on-surface-variant uppercase tracking-wider">
            <span>Workspaces</span>
            <span className="text-outline/40">/</span>
            <span className="text-primary font-semibold">EOD Reflection & Audit</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <h1 className="text-headline-lg text-on-surface tracking-tight">Daily Review</h1>
            <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 gap-0.5 max-w-full flex-wrap">
              <button type="button" title="Previous day" onClick={() => setDayOffset((n) => n - 1)} className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex-shrink-0">
                <Icon name="chevron_left" className="text-[16px]" />
              </button>
              <div className="flex items-center gap-1.5 px-1.5">
                <span className="font-mono text-body-sm font-medium text-on-surface">
                  {viewedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                </span>
                {dayOffset === 0 && (
                  <span className="font-mono text-label-xs bg-primary-fixed text-on-primary-fixed px-1.5 py-0.5 rounded font-semibold">Today</span>
                )}
              </div>
              <button
                type="button"
                title="Next day"
                disabled={dayOffset >= 0}
                onClick={() => setDayOffset((n) => n + 1)}
                className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Icon name="chevron_right" className="text-[16px]" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={exportSummary} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-low shadow-sm transition-colors text-body-sm">
            <Icon name="ios_share" className="text-[16px] text-on-surface-variant" />
            <span>Export Summary</span>
            <kbd className="font-mono text-[10px] bg-surface-container-high px-1 rounded text-on-surface-variant">⌘E</kbd>
          </button>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-low shadow-sm transition-colors text-body-sm">
            <Icon name="print" className="text-[16px] text-on-surface-variant" />
            <span>Print PDF</span>
          </button>
          <button type="button" onClick={() => router.push("/")} className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-colors text-body-sm font-semibold">
            <span>Done Reviewing</span>
            <kbd className="font-mono text-[10px] bg-black/15 px-1 rounded">Esc</kbd>
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="rounded-xl bg-surface-container-lowest shadow-sm p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="flex flex-col gap-1.5 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded font-mono text-code-badge font-semibold bg-secondary-container text-on-secondary-fixed">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                TEMPORAL AUDIT COMPLETED
              </span>
              <span className="text-body-sm text-on-surface-variant font-medium">Cadence Adherence: {adherence.toFixed(1)}%</span>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap mt-0.5">
              <span className="text-display-xl tracking-tight text-on-surface">{formatDurationMinutes(stats.focusedMinutes)}</span>
              <span className="text-headline-md text-on-surface-variant font-normal">actual focus delivered of</span>
              <span className="text-headline-md font-semibold text-on-surface">{formatDurationMinutes(stats.plannedMinutes)}</span>
              <span className="text-headline-md text-on-surface-variant font-normal">planned</span>
            </div>
            <p className="text-body-md text-secondary leading-relaxed">
              Net focus variance was{" "}
              <span className="font-mono text-on-surface font-semibold">
                {variance <= 0 ? "−" : "+"}{formatDurationMinutes(Math.abs(variance))}
              </span>
              . {stats.perTask.filter((t) => t.remainingMinutes > 0).length} of {stats.perTask.length} tasks below
              target{stats.perTask.some((t) => t.remainingMinutes === 0 && t.plannedMinutes > 0) ? "; the rest hit their allocation" : ""}.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-surface-container-low p-4 rounded-lg self-start">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <path className="text-surface-variant" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" />
                <path className="text-primary transition-all duration-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${adherence}, 100`} strokeLinecap="round" strokeWidth="3.5" />
              </svg>
              <span className="absolute font-mono text-body-sm font-semibold text-on-surface">{adherence}%</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-code-badge uppercase text-on-surface-variant font-medium">Daily Target</span>
              <span className="text-body-sm font-medium text-on-surface">{stats.completedPomodoros} blocks locked</span>
              <span className="text-label-xs text-secondary mt-0.5">High Focus Horizon</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex justify-between items-center text-label-xs text-on-surface-variant flex-wrap gap-2">
            <span className="uppercase tracking-wider">Temporal Composition ({formatDurationMinutes(stats.plannedMinutes)} Planned Horizon)</span>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary-container" /> Deep Focus ({formatDurationMinutes(stats.focusedMinutes)})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-variant" /> Pause / Variance ({formatDurationMinutes(pausedMin)})</span>
            </div>
          </div>
          <div className="h-4 w-full bg-surface-container rounded-md overflow-hidden flex p-0.5 gap-0.5">
            <div className="h-full bg-primary-container rounded-l-sm transition-all duration-500" style={{ width: `${Math.round((stats.focusedMinutes / total) * 100)}%` }} />
            <div className="h-full bg-surface-variant rounded-r-sm transition-all duration-500" style={{ width: `${Math.max(2, Math.round((pausedMin / total) * 100))}%` }} />
          </div>
          <div className="flex justify-between gap-x-3 gap-y-1 flex-wrap text-label-xs font-mono text-on-surface-variant">
            <span>{firstStart ? `${new Date(firstStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} START` : "NO START"}</span>
            <span>{midLabel}</span>
            <span>{lastEnd ? `${new Date(lastEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} EOD CONCLUDED` : "OPEN DAY"}</span>
          </div>
        </div>
      </section>

      {/* Tiles */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: "Focused Time", icon: "timer", value: formatDurationMinutes(stats.focusedMinutes), sub: `${pomoDone} sessions completed` },
          { label: "In-Session Pause", icon: "pause_circle", value: formatDurationMinutes(pausedMin), sub: "Within active timers" },
          { label: "Interruptions", icon: "notifications_paused", value: String(interruptions), valueSuffix: "events", sub: `Avg ${(interruptions > 0 ? pausedMs / interruptions / 60000 : 0).toFixed(1)}m recovery lag` },
          { label: "Pomodoros", icon: "check_circle", value: String(stats.completedPomodoros), valueSuffix: "cycles", sub: `${intentional}% intentional finish` },
          { label: "Avg Session", icon: "avg_time", value: formatDurationMinutes(Math.round(avgMs / 60000)), sub: `Cadence adherence ${cadence}%` },
        ].map((t) => (
          <div key={t.label} className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-code-badge uppercase text-on-surface-variant font-medium">{t.label}</span>
              <Icon name={t.icon} className="text-[16px] text-primary" />
            </div>
            <div className="flex flex-col mt-1">
              <span className="font-mono text-metric-mono-lg text-on-surface leading-tight tabular-nums">
                {t.value} {t.valueSuffix && <span className="text-body-sm text-secondary font-normal">{t.valueSuffix}</span>}
              </span>
              <span className="text-label-xs text-secondary mt-1">{t.sub}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Adherence matrix */}
        <section className="lg:col-span-7 flex flex-col gap-1 bg-surface-container-lowest rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-headline-md text-on-surface">Task Adherence Matrix</h2>
              <span className="font-mono text-code-badge px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">{stats.perTask.length} Target Tasks</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-label-xs text-on-surface-variant">
              <span className="inline-block w-2 h-2 rounded-full bg-primary" />
              <span>Variance tracked in real-time</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 mt-0.5">
            {stats.perTask.length === 0 && (
              <p className="text-body-sm text-secondary p-2">No tasks planned for this day.</p>
            )}
            {stats.perTask.map((t) => {
              const recs = daySessions.filter((x) => x.phase === "FOCUS" && (x.taskId === t.taskId || x.taskTitle === t.title));
              const v = t.actualMinutes - t.plannedMinutes;
              return (
                <div key={t.taskId} className="flex flex-col p-3 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-body-sm font-semibold text-on-surface truncate">{t.title}</span>
                      </div>
                      <span className="text-label-xs text-secondary mt-0.5">
                        {recs.length} session{recs.length === 1 ? "" : "s"} · {recs.reduce((s, x) => s + x.interruptions, 0)} interruptions encountered
                      </span>
                    </div>
                    <div className="flex flex-col items-end shrink-0 leading-tight">
                      <span className="font-mono text-body-sm font-semibold text-on-surface">
                        {formatDurationMinutes(t.actualMinutes)} <span className="text-secondary font-normal text-label-xs">/ {formatDurationMinutes(t.plannedMinutes)}</span>
                      </span>
                      <span className={cn("font-mono text-label-xs font-medium", v < 0 ? "text-error" : "text-secondary")}>
                        {v === 0 ? "On target" : `${v > 0 ? "+" : "−"}${formatDurationMinutes(Math.abs(v))} variance`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${t.percent}%` }} />
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-label-xs text-on-surface-variant shrink-0">
                      <span className="font-semibold text-on-surface">{t.percent}%</span>
                      <span className="text-outline-variant/60">·</span>
                      <span className={t.remainingMinutes === 0 ? "text-secondary font-semibold" : ""}>
                        {t.remainingMinutes === 0 ? "Completed" : `${formatDurationMinutes(t.remainingMinutes)} left`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-surface-container flex gap-2.5 items-start">
            <Icon name="lightbulb" className="text-[18px] text-primary shrink-0 mt-0.5" />
            <div className="flex flex-col text-body-sm text-on-surface leading-snug">
              <span className="font-semibold">Observation & Pattern Recognition</span>
              <span className="text-secondary mt-0.5">
                {longest
                  ? `Your deepest sustained cadence was ${formatDurationMinutes(Math.round(longest.focusedMs / 60000))} starting ${fmtHM(longest.startedAt)} with zero interruptions.`
                  : "Log uninterrupted sessions to surface your peak cadence window."}{" "}
                {interruptions > 0 && ` ${interruptions} interruption${interruptions === 1 ? "" : "s"} added ${formatDurationMinutes(pausedMin)} of recovery overhead.`}
              </span>
            </div>
          </div>
        </section>

        {/* Day sequence */}
        <section className="lg:col-span-5 flex flex-col bg-surface-container-lowest rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-headline-md text-on-surface">Day Sequence</h2>
              <span className="font-mono text-label-xs bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant font-medium">
                {sequence.length} Entries
              </span>
            </div>
            <span className="font-mono text-label-xs text-secondary">
              {sequence.length > 0 ? `${fmtHM(sequence[0].at)} - ${fmtHM(daySessions[daySessions.length - 1]?.endedAt ?? sequence[0].at)}` : "—"}
            </span>
          </div>
          <div className="relative flex flex-col gap-1 mt-1 overflow-y-auto max-h-[480px] pr-1">
            {sequence.length === 0 && <p className="text-body-sm text-secondary p-2">Nothing logged this day.</p>}
            {sequence.map((e, i) => (
              <div key={i} className={cn("flex items-start gap-2.5 p-1.5 rounded transition-colors", e.kind === "focus" ? "bg-surface-container-low" : "hover:bg-surface-container-low")}>
                <span className={cn("font-mono text-[11px] w-14 shrink-0 pt-0.5", e.kind === "focus" ? "text-primary font-medium" : "text-on-surface-variant")}>
                  {fmtHM(e.at)}
                </span>
                <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", e.kind === "focus" ? "bg-primary" : "bg-outline-variant")} />
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-body-sm truncate", e.kind === "focus" ? "font-semibold text-on-surface" : "text-secondary")}>{e.title}</span>
                    <span className={cn("font-mono text-[11px] flex-shrink-0", e.kind === "focus" ? "text-primary font-semibold" : "text-secondary")}>
                      {e.kind === "focus" ? formatDurationMinutes(e.minutes) : `${e.minutes}m`}
                    </span>
                  </div>
                  <span className="text-label-xs text-secondary truncate">{e.sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /><span>Deep Focus</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-outline-variant" /><span>Buffer / Rest</span></div>
          </div>
        </section>
      </div>

      {/* Tomorrow */}
      <section className="rounded-xl bg-surface-container-lowest shadow-sm p-4 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon name="forward" className="text-[20px] text-primary" />
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-headline-md text-on-surface">Tomorrow&apos;s Staged Blocks</h2>
              <span className="text-body-sm text-secondary font-medium">{tomorrowLabel}</span>
            </div>
            <span className="font-mono text-code-badge px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-semibold">
              {formatDurationMinutes(tomorrowPlanned)} planned
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/plan" className="flex items-center gap-1.5 h-8 sm:h-7 px-3 rounded bg-primary text-on-primary hover:bg-primary-container transition-colors text-body-sm font-medium">
              <span>Adjust Plan</span>
              <kbd className="font-mono text-[10px] bg-black/15 px-1 rounded">T</kbd>
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-0.5">
          {tomorrowTasks.length === 0 && (
            <p className="text-body-sm text-secondary">Nothing staged for tomorrow yet.</p>
          )}
          {tomorrowTasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="flex flex-col p-3 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
              <div className="flex items-center justify-between">
                <span className="font-mono text-label-xs text-primary font-semibold">
                  {t.startMs ? fmtHM(t.startMs) : "Unscheduled"}
                </span>
                {t.project && (
                  <span className="font-mono text-[10px] bg-surface-container-high text-on-surface-variant px-1.5 py-px rounded font-medium">{t.project}</span>
                )}
              </div>
              <span className="text-body-sm font-semibold text-on-surface mt-1 truncate">{t.title}</span>
              <div className="flex items-center justify-between mt-2 text-label-xs text-secondary">
                <span>{formatDurationMinutes(t.allocatedMinutes)} allocated</span>
                <span className="flex items-center gap-1 font-medium text-on-surface">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {countPlannedPomodoros(t.allocatedMinutes, t.focusMinutes)} cycles
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
