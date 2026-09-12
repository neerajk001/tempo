"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePomodoroStore, resolveBreaks } from "@/stores/pomodoro-store";
import { useTaskStore, selectTaskById, getFocusMode, getSessionLabel } from "@/stores/task-store";
import { useSessionHistoryStore, getRecordLabel, getSessionMode } from "@/stores/session-history-store";
import { computeDashboardStats } from "@/lib/dashboard-stats";
import { calculatePomodoroPlan, todayKey } from "@/lib/task-planning";
import { formatDurationMinutes } from "@/lib/utils";
import { formatElapsedHMS } from "@/components/pomodoro/FocusTimer";
import Icon from "@/components/ui/Icon";

export default function CompleteView() {
  const router = useRouter();
  const session = usePomodoroStore((s) => s.session);
  const config = usePomodoroStore((s) => s.config);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const startBreak = usePomodoroStore((s) => s.startBreak);
  const start = usePomodoroStore((s) => s.start);
  const startQuick = usePomodoroStore((s) => s.startQuick);
  const breakOverride = usePomodoroStore((s) => s.breakOverride);
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);

  const record = sessions.find((x) => x.phase === "FOCUS" && x.status === "COMPLETED") ?? null;
  const task = selectTaskById(tasks, record?.taskId ?? activeTaskId);
  const stats = computeDashboardStats(tasks, sessions, todayKey());
  const recordInfinite = record ? getSessionMode(record) === "infinite" : (task ? getFocusMode(task) === "infinite" : false);
  const recordLabel = record ? getRecordLabel(record, record.taskTitle ?? task?.title ?? "Deep Work") : "Deep Work";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (tag === "BUTTON" && (e.code === "Space" || e.code === "KeyF")) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) goBreak();
      } else if (e.code === "KeyF") {
        if (!e.repeat) goFocus();
      } else if (e.code === "Escape") {
        router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, task, tasks]);

  if (!record) {
    return (
      <div className="fixed inset-0 z-50 bg-surface text-on-surface flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">No completed session yet</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Finish a focus block and its summary will land here.</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold"
          >
            Back to Command Center
          </button>
        </div>
      </div>
    );
  }

  const focusedMin = Math.max(1, Math.round(record.focusedMs / 60000));
  const plannedMin = recordInfinite ? 0 : Math.max(1, Math.round(record.plannedMs / 60000));
  const pausedMin = Math.round(record.pausedMs / 60000);
  const efficiency = recordInfinite
    ? "—"
    : ((record.focusedMs / Math.max(1, record.plannedMs)) * 100).toFixed(1);
  const blockNum = task ? task.completedPomodoros : session.completedFocusCount;
  const planLen = (() => {
    if (recordInfinite || !task || getFocusMode(task) === "infinite") return Math.max(blockNum, 1);
    try {
      return calculatePomodoroPlan(task.allocatedMinutes, task.focusMinutes).length;
    } catch {
      return Math.max(blockNum, 1);
    }
  })();
  const taskFocused = task?.focusedMinutes ?? 0;
  const taskAllocated = task?.allocatedMinutes ?? focusedMin;
  const taskPct = recordInfinite
    ? taskFocused > 0 ? 100 : 0
    : taskAllocated > 0 ? Math.min(100, Math.round((taskFocused / taskAllocated) * 100)) : 0;
  const breakMin = Math.round(resolveBreaks(config, breakOverride).shortBreakMs / 60000);

  const goBreak = () => {
    // Infinite sessions track breaks inline via pause — there is no break
    // phase to advance to. Return to the dashboard instead.
    if (recordInfinite) {
      router.push("/");
      return;
    }
    const st = usePomodoroStore.getState().session.status;
    if (st === "COMPLETED" || st === "CANCELLED" || st === "IDLE") startBreak();
    router.push("/break");
  };
  const goFocus = () => {
    const st = usePomodoroStore.getState().session.status;
    if (st === "COMPLETED" || st === "CANCELLED" || st === "IDLE") {
      if (task) useTaskStore.getState().switchToTask(task.id);
      else if (record) startQuick(record.taskTitle, record.plannedMs);
      else start("FOCUS");
    }
    router.push("/focus");
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface text-on-surface antialiased flex flex-col justify-between overflow-hidden overflow-y-auto">
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ background: "radial-gradient(circle at 50% 45%, rgba(127,176,105,0.07) 0%, rgba(232,200,106,0.035) 38%, transparent 72%)" }} />

      {/* Top chrome */}
      <header className="relative z-10 w-full px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-3 flex-wrap border-b border-outline-variant bg-surface-container-lowest/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary text-on-primary flex items-center justify-center shadow-sm">
              <svg className="w-3.5 h-3.5 stroke-[2.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
                <polyline points="12 7 12 12 15 15" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-on-surface">Tempo</span>
          </div>
          <span className="text-on-surface-variant/40">/</span>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-fixed border border-primary/20 text-on-primary-fixed text-[11px] font-mono font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {recordInfinite ? "INFINITE SESSION COMPLETE" : "POMODORO COMPLETE"}
          </div>
          {!recordInfinite && (
            <span className="text-on-surface-variant text-xs font-mono ml-1">Session {blockNum} of {Math.max(planLen, 1)}</span>
          )}
          {recordInfinite && (
            <span className="text-on-surface-variant text-xs font-mono ml-1">Open-ended • {formatElapsedHMS(record.focusedMs)} elapsed</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="hidden sm:flex items-center gap-2 text-on-surface-variant font-mono">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            Session logged
          </div>
          <div className="hidden sm:block h-3 w-px bg-outline-variant" />
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-2.5 py-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors font-mono flex items-center gap-1.5"
          >
            Esc <span className="text-[11px] text-on-surface-variant/70">Exit Focus</span>
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute w-44 h-44 rounded-full border border-primary/20 animate-pulse-ring pointer-events-none" />
          <div className="absolute w-36 h-36 rounded-full border border-primary-fixed pointer-events-none" />
          <div className="w-20 h-20 rounded-full bg-surface-container-lowest shadow-sm border border-outline-variant flex items-center justify-center relative" style={{ boxShadow: "0 0 32px rgba(127,176,105,0.18)" }}>
            <svg className="w-8 h-8 text-primary animate-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 48 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <div className="text-center max-w-xl mx-auto mb-8 animate-rise">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-outline-variant text-on-surface-variant text-xs font-mono uppercase tracking-wider mb-2.5">
            {recordInfinite ? "Open-Ended Session Ended" : "Interval Concluded"}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-on-surface mb-2">Session complete</h1>
          <p className="text-sm sm:text-base text-on-surface-variant font-normal">
            Great rhythm on <span className="font-medium text-on-surface tracking-tight">&quot;{recordLabel}&quot;</span>
          </p>
        </div>

        {/* Results card */}
        <div className="w-full max-w-lg bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-7 mb-7 animate-rise" style={{ animationDelay: "0.08s" }}>
          <div className="flex items-baseline justify-between border-b border-outline-variant pb-5">
            <div>
              <span className="text-5xl sm:text-6xl font-semibold tracking-tight text-on-surface font-mono">
                {focusedMin}<span className="text-2xl sm:text-3xl font-medium text-on-surface-variant ml-1">m</span>
              </span>
              <p className="text-xs font-mono font-medium uppercase tracking-widest text-on-primary-fixed mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                Focused
              </p>
            </div>
            <div className="text-right space-y-1 font-mono text-xs">
              {recordInfinite ? (
                <>
                  <div className="text-on-surface-variant">
                    Elapsed <span className="font-semibold text-on-surface">{formatElapsedHMS(record.focusedMs)}</span>
                  </div>
                  <div className="text-on-primary-fixed font-medium">
                    Paused <span className="font-semibold">{formatDurationMinutes(pausedMin)}</span>
                    <span className="text-on-surface-variant font-normal"> • {record.interruptions} interruptions</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-on-surface-variant">
                    Target cadence <span className="font-semibold text-on-surface">{focusedMin}m / {plannedMin}m</span>
                  </div>
                  <div className="text-on-primary-fixed font-medium">
                    Focus efficiency <span className="font-semibold">{efficiency}%</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-5 pb-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface-variant shrink-0">
                <Icon name="pause" className="text-[16px]" />
              </div>
              <div>
                <div className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">Paused</div>
                <div className="text-sm font-semibold font-mono text-on-surface">{pausedMin}m</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface-variant shrink-0">
                <Icon name="close" className="text-[16px]" />
              </div>
              <div>
                <div className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">Interruptions</div>
                <div className="text-sm font-semibold font-mono text-on-accent-amber">{record.interruptions}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Task progress card */}
        {task && (
          <div className="w-full max-w-lg bg-surface-container-low rounded-2xl border border-outline-variant p-5 mb-8 animate-rise" style={{ animationDelay: "0.14s" }}>
            <div className="flex items-center justify-between text-xs font-mono mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-on-surface">Task Progress</span>
                <span className="text-on-surface-variant/50">•</span>
                <span className="text-on-surface-variant truncate">{recordInfinite ? getSessionLabel(task, task.title) : task.title}</span>
                {recordInfinite && (
                  <span className="px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-semibold text-[11px]">∞ Infinite</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-semibold text-on-surface">
                  {recordInfinite ? (
                    <>{formatDurationMinutes(taskFocused)} <span className="text-on-surface-variant font-normal">focused</span></>
                  ) : (
                    <>{formatDurationMinutes(taskFocused)} <span className="text-on-surface-variant font-normal">/ {formatDurationMinutes(taskAllocated)}</span></>
                  )}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-semibold text-[11px] border border-primary/20">{taskPct}%</span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden relative">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent-lime" style={{ width: `${taskPct}%` }} />
            </div>
            {!recordInfinite && (
            <div className="flex items-center justify-between mt-2.5 text-[11px] font-mono text-on-surface-variant">
              <span className="flex items-center gap-1.5 text-on-primary-fixed">
                <svg className="w-3 h-3 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Block {blockNum} completed
              </span>
              <span className="text-on-surface-variant">Pomodoro {Math.min(blockNum + 1, Math.max(planLen, 1))} of {Math.max(planLen, 1)} remaining</span>
            </div>
            )}
            {recordInfinite && (
            <div className="flex items-center justify-between mt-2.5 text-[11px] font-mono text-on-surface-variant">
              <span className="text-on-primary-fixed">Session saved • {formatElapsedHMS(record.focusedMs)} focused</span>
              <span>Paused {formatDurationMinutes(pausedMin)} • {record.interruptions} interruptions</span>
            </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="w-full max-w-lg flex flex-col items-center gap-3 animate-rise" style={{ animationDelay: "0.2s" }}>
          <div className={`grid grid-cols-1 ${recordInfinite ? "" : "sm:grid-cols-2"} gap-3 w-full`}>
            {!recordInfinite && (
            <button
              type="button"
              onClick={() => {
                startBreak();
                router.push("/break");
              }}
              className="group relative flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-tertiary-fixed hover:brightness-125 border border-tertiary/25 text-on-tertiary-fixed font-medium text-sm transition-all active:scale-[0.99]"
            >
              <Icon name="coffee" className="text-[16px] text-tertiary group-hover:scale-110 transition-transform" />
              <span>Start Break</span>
              <span className="text-xs font-mono text-on-tertiary-fixed bg-black/25 px-1.5 py-0.5 rounded border border-tertiary/20">{breakMin}m</span>
              <kbd className="hidden sm:inline-block ml-1 text-[10px] font-mono text-on-tertiary-fixed/70 bg-black/25 px-1.5 py-0.5 rounded">Space</kbd>
            </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (task) useTaskStore.getState().switchToTask(task.id);
                else if (record) startQuick(record.taskTitle, record.plannedMs);
                else start("FOCUS");
                router.push("/focus");
              }}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-sm transition-all active:scale-[0.99]"
            >
              <Icon name="play_arrow" className="text-[16px]" />
              <span>Start Next Focus</span>
              <kbd className="hidden sm:inline-block ml-1 text-[10px] font-mono text-on-primary/70 bg-black/15 px-1.5 py-0.5 rounded">F</kbd>
            </button>
          </div>
          <div className="mt-1">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="px-4 py-2 text-xs font-mono text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors flex items-center gap-1.5"
            >
              <span>Done for now</span>
              <span className="text-on-surface-variant/50">•</span>
              <span className="text-[11px] text-on-surface-variant">Save log & return to Command Center</span>
              <kbd className="text-[10px] text-on-surface-variant bg-surface-container-high px-1 py-0.5 rounded ml-1 border border-outline-variant">Esc</kbd>
            </button>
          </div>
        </div>
      </main>

      {/* Telemetry dock */}
      <footer className="relative z-10 w-full px-4 sm:px-8 py-4 border-t border-outline-variant bg-surface-container-lowest/70 flex flex-col sm:flex-row items-center justify-between text-xs text-on-surface-variant font-mono gap-2">
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <span className="flex items-center gap-1.5 text-on-surface">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Daily goal: {formatDurationMinutes(stats.focusedMinutes)} of {formatDurationMinutes(Math.max(stats.plannedMinutes, stats.focusedMinutes))}
          </span>
          <span className="hidden sm:inline text-outline">|</span>
          <span className="hidden sm:inline text-on-surface-variant">
            {recordInfinite
              ? "Open-ended session — pause and resume manually"
              : "Auto-break countdown: paused (deliberate start)"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-on-surface-variant">Keyboard shortcuts enabled</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant text-on-surface-variant text-[10px]">Space</kbd> Break
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant text-on-surface-variant text-[10px]">F</kbd> Next
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant text-on-surface-variant text-[10px]">Esc</kbd> Exit
          </span>
        </div>
      </footer>
    </div>
  );
}
