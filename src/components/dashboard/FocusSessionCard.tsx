"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePomodoroStore, resolveBreaks } from "@/stores/pomodoro-store";
import { useTaskStore, selectTaskById, getFocusMode, getSessionLabel, getTaskFocusedMs } from "@/stores/task-store";
import { useNow } from "@/hooks/useNow";
import { useFinishSession } from "@/hooks/useFinishSession";
import { getElapsedFocusMs, getRemainingMs, isExpired } from "@/lib/pomodoro-machine";
import { calculatePomodoroPlan, todayKey } from "@/lib/task-planning";
import { formatClock } from "@/lib/utils";
import { formatElapsedHMS } from "@/components/pomodoro/FocusTimer";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DurationPicker from "@/components/dashboard/DurationPicker";
import QuickCadenceFields from "@/components/dashboard/QuickCadenceFields";
import QuickCreditPicker, { useCreditChoice } from "@/components/dashboard/QuickCreditPicker";
import Icon from "@/components/ui/Icon";

function scratchKey(taskId: string | null): string {
  return `tempo-scratch-${taskId ?? "general"}`;
}

export default function FocusSessionCard() {
  const router = useRouter();
  const session = usePomodoroStore((s) => s.session);
  const config = usePomodoroStore((s) => s.config);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const activeTaskTitle = usePomodoroStore((s) => s.activeTaskTitle);
  const quickLabel = usePomodoroStore((s) => s.quickLabel);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const extend = usePomodoroStore((s) => s.extend);
  const startQuick = usePomodoroStore((s) => s.startQuick);
  const focusMode = usePomodoroStore((s) => s.focusMode);
  const sessionName = usePomodoroStore((s) => s.sessionName);
  const reset = usePomodoroStore((s) => s.reset);
  const clearQuickTitle = usePomodoroStore((s) => s.setActiveTask);
  const unlinkActiveTask = usePomodoroStore((s) => s.setActiveTask);
  const tasks = useTaskStore((s) => s.tasks);
  const switchToTask = useTaskStore((s) => s.switchToTask);
  const moveTaskToToday = useTaskStore((s) => s.updateTask);
  const { handleComplete, handleCancel } = useFinishSession();
  const [mounted, setMounted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMinutes, setNewMinutes] = useState(() => {
    const d = Math.round(config.focusMs / 60000);
    return [15, 25, 50, 90].includes(d) ? d : 25;
  });
  const [newShortMin, setNewShortMin] = useState(() =>
    Math.round(config.shortBreakMs / 60000)
  );
  const [newLongMin, setNewLongMin] = useState(() =>
    Math.round(config.longBreakMs / 60000)
  );
  const [newInterval, setNewInterval] = useState(config.longBreakInterval);
  const [note, setNote] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMinutes, setQuickMinutes] = useState(15);
  const prevStatus = useRef(session.status);
  useEffect(() => setMounted(true), []);

  const ticking = session.status === "RUNNING" || session.status === "PAUSED";
  const now = useNow(ticking);

  useEffect(() => {
    if (session.status === "RUNNING" && isExpired(session, Date.now())) handleComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, now]);

  // A finished focus block lands on the Session Complete screen.
  useEffect(() => {
    if (
      prevStatus.current !== "COMPLETED" &&
      session.status === "COMPLETED" &&
      session.phase === "FOCUS"
    ) {
      router.push("/complete");
    }
    prevStatus.current = session.status;
  }, [session, router]);

  const activeTask = selectTaskById(tasks, activeTaskId);
  const activeMode = activeTask ? getFocusMode(activeTask) : focusMode;
  const isInfinite = activeMode === "infinite" || session.isInfinite === true || focusMode === "infinite";
  // Quick-block candidates: today's open tasks, falling back to any open task.
  const creditCandidates = useMemo(() => {
    const open = tasks.filter(
      (t) => t.status !== "COMPLETED" && t.status !== "CANCELLED"
    );
    const todayOpen = open.filter((t) => t.date === todayKey());
    return todayOpen.length > 0 ? todayOpen : open;
  }, [tasks]);
  const [quickCredit, setQuickCredit] = useCreditChoice(creditCandidates);
  const isQuick = quickLabel !== null;
  const isCreditedQuick = isQuick && activeTaskId !== null;
  // Linked task dated another day: card and daily numbers disagree.
  const isStaleDate = activeTask != null && activeTask.date !== todayKey();
  const beginQuickBlock = () => {
    if (session.status !== "IDLE") return;
    startQuick(undefined, quickMinutes * 60000, undefined, quickCredit);
    setQuickOpen(false);
  };
  const breakOverride = usePomodoroStore((s) => s.breakOverride);
  const effBreaks = resolveBreaks(config, breakOverride);
  const displayTask = activeTask ?? tasks.find((t) => t.date === new Date().toISOString().slice(0, 10) && t.status !== "COMPLETED" && t.status !== "CANCELLED") ?? null;
  const title = activeTask
    ? getFocusMode(activeTask) === "infinite"
      ? getSessionLabel(activeTask, activeTask.title)
      : activeTask.title
    : displayTask && getFocusMode(displayTask) === "infinite"
      ? getSessionLabel(displayTask, displayTask.title)
      : (sessionName?.trim() || activeTaskTitle || displayTask?.title || "Ready to focus");
  const description =
    activeTask?.description ||
    displayTask?.description ||
    (ticking && activeTaskTitle
      ? "Allocation-free quick session — logging to History."
      : "Pick a task below and start your first block.");

  useEffect(() => {
    try {
      setNote(window.localStorage.getItem(scratchKey(activeTaskId)) ?? "");
    } catch {
      setNote("");
    }
  }, [activeTaskId]);

  const saveNote = (v: string) => {
    setNote(v);
    try {
      window.localStorage.setItem(scratchKey(activeTaskId), v);
    } catch {
      // Optional — ignore storage failures.
    }
  };

  const plan = useMemo(() => {
    const t = activeTask ?? displayTask;
    if (!t || getFocusMode(t) === "infinite") return [];
    try {
      return calculatePomodoroPlan(t.allocatedMinutes, t.focusMinutes).slice(0, 9);
    } catch {
      return [];
    }
  }, [activeTask, displayTask]);
  const doneCount = activeTask?.completedPomodoros ?? session.completedFocusCount;
  const totalCount = plan.length > 0 ? plan.length : Math.max(doneCount + 1, 1);
  const currentIdx = Math.min(doneCount, Math.max(0, totalCount - 1));
  const currentSliceMin = plan[currentIdx]?.minutes ?? Math.round(session.plannedMs / 60000);
  const focusMin = (activeTask ?? displayTask)?.focusMinutes ?? Math.round(config.focusMs / 60000);

  if (!mounted) {
    return <div className="bg-surface-container-lowest rounded-xl shadow-md p-6 text-body-sm text-secondary">Loading session…</div>;
  }

  const remainingMs = isInfinite
    ? Number.POSITIVE_INFINITY
    : session.status === "IDLE" && (activeTask ?? displayTask)
      ? currentSliceMin * 60000
      : getRemainingMs(session, now);
  const elapsedMs = getElapsedFocusMs(session, now);
  const totalElapsedMs = isInfinite && (activeTask ?? displayTask)
    ? getTaskFocusedMs(activeTask ?? displayTask!) + elapsedMs
    : elapsedMs;
  const remainingSec = Number.isFinite(remainingMs) ? Math.ceil(remainingMs / 1000) : 0;
  const elapsedMin = Math.floor(totalElapsedMs / 60000);
  const elapsedSec = Math.floor((totalElapsedMs % 60000) / 1000);
  const plannedMin = isInfinite
    ? 0
    : session.status === "IDLE" && (activeTask ?? displayTask)
      ? currentSliceMin
      : Math.max(1, Math.round(session.plannedMs / 60000));
  const ringPct = isInfinite || session.plannedMs <= 0 ? 0 : Math.min(100, Math.round((elapsedMs / session.plannedMs) * 100));
  const R = 20;
  const CIRC = 2 * Math.PI * R;

  const startPrimary = () => {
    // Only a live run is off-limits here; from IDLE or a finished/cancelled
    // session this starts the next block.
    if (session.status === "RUNNING" || session.status === "PAUSED") return;
    // switchToTask preserves the previous task's state and resumes the
    // selected task from its exact prior state (single-active).
    if (activeTask) switchToTask(activeTask.id);
    else if (displayTask) switchToTask(displayTask.id);
    else startQuick();
  };

  const isTerminal = session.status === "COMPLETED" || session.status === "CANCELLED";
  const dismiss = () => {
    // Safety: never touch a live timer. The button only renders in
    // terminal states, but guard anyway so it can never kill a run —
    // dismiss only clears the card display, never History.
    const st = usePomodoroStore.getState().session.status;
    if (st === "RUNNING" || st === "PAUSED") return;
    // Back to standby without touching localStorage manually:
    // reset() persists a fresh IDLE state, and a lingering quick-session
    // label is cleared so the card stops showing the old run.
    if (!activeTaskId) clearQuickTitle(null);
    reset();
  };

  const discardCurrent = () => {
    setConfirmingDiscard(false);
    // Stop the live run first: partial work is preserved in History as
    // a CANCELLED session (same as everywhere else in the app), then
    // return the card to a clean standby.
    handleCancel();
    if (!usePomodoroStore.getState().activeTaskId) {
      usePomodoroStore.getState().setActiveTask(null);
    }
    reset();
  };

  const doResetInfinite = () => {
    setConfirmingReset(false);
    // Reset the infinite timer back to 00:00:00:
    // 1) archive the live run (if any) to History as CANCELLED so nothing
    //    is silently lost, 2) zero the linked infinite task's accumulated
    //    progress, 3) return the live session to IDLE standby.
    // History records are kept — only the visible timer + task totals clear.
    const st = usePomodoroStore.getState().session.status;
    const live = st === "RUNNING" || st === "PAUSED";
    if (live) {
      try {
        handleCancel();
      } catch {
        // Never block the reset on a history write.
      }
    }
    try {
      const tasksNow = useTaskStore.getState().tasks;
      const target =
        selectTaskById(tasksNow, activeTaskId) ??
        tasks.find((t) => t.date === new Date().toISOString().slice(0, 10) && t.status !== "COMPLETED" && t.status !== "CANCELLED") ??
        null;
      if (target && getFocusMode(target) === "infinite") {
        useTaskStore.getState().resetTaskProgress(target.id);
      }
    } catch {
      // Task reset is best-effort — the live timer reset below still runs.
    }
    usePomodoroStore.getState().reset();
  };

  const replaceCurrent = () => {
    // Archive the live run (logged as CANCELLED, nothing lost), then
    // immediately start a fresh session under the new name.
    handleCancel();
    startQuick(newTitle || undefined, newMinutes * 60000, {
      shortBreakMs: newShortMin * 60000,
      longBreakMs: newLongMin * 60000,
      longBreakInterval: newInterval,
    });
    setNewTitle("");
    setReplacing(false);
    router.push("/focus");
  };

  return (
    <div className="relative overflow-hidden bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 sm:p-6">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent-amber to-tertiary opacity-80" />
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-mono text-code-badge font-semibold tracking-wide">
              <span className={`w-1.5 h-1.5 rounded-full bg-primary ${ticking ? "animate-ping" : ""}`} />
              {ticking ? "CURRENTLY FOCUSING" : session.status === "COMPLETED" ? "SESSION COMPLETE" : "STANDBY"}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-label-xs font-medium">
              {isInfinite ? "Infinite • open-ended" : `Today • ${focusMin}m blocks`}
            </span>
            {!isInfinite && (
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-secondary text-label-xs font-medium flex items-center gap-1">
              <Icon name="schedule" className="text-[12px]" />
              Block {currentIdx + 1} of {totalCount}
            </span>
            )}
            {isInfinite && (
            <span className="px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-label-xs font-semibold">
              ∞ Infinite Focus
            </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-secondary font-mono text-code-badge">
            {session.phase === "FOCUS" ? (
              <Link
                href="/focus"
                title="Open full-screen timer (F)"
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-sans text-label-xs font-semibold text-on-primary hover:bg-primary-container transition-colors no-underline"
              >
                <Icon name="open_in_full" className="text-[14px]" />
                Full screen
              </Link>
            ) : (
              <Link href="/break" className="underline hover:text-on-surface">
                Open break view
              </Link>
            )}
            {isTerminal && (
              <button
                type="button"
                onClick={dismiss}
                title="Dismiss — clear this completed session"
                aria-label="Dismiss completed session"
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <h2 className="text-headline-lg text-on-surface tracking-tight font-semibold">{title}</h2>
          <p className="text-body-md text-on-surface-variant line-clamp-2">{description}</p>
          {isCreditedQuick && ticking && !isInfinite && (
            <span className="self-start inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-mono text-code-badge font-semibold">
              <Icon name="bolt" className="text-[12px]" />
              <span>
                Quick {plannedMin}m → counts in {activeTask?.title ?? activeTaskTitle}
              </span>
            </span>
          )}
          {isQuick && !activeTaskId && ticking && (
            <span className="self-start inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-mono text-code-badge font-medium">
              <span>Quick {plannedMin}m · separate session</span>
            </span>
          )}
          {isStaleDate && activeTask && (
            <div className="self-start flex items-center gap-2 mt-1.5 px-2.5 py-1.5 rounded-lg bg-accent-amber-container/60 border border-accent-amber/25 flex-wrap">
              <span className="text-body-sm text-on-surface">
                Dated {activeTask.date} — move it to today so stats count it?
              </span>
              <button
                type="button"
                onClick={() => moveTaskToToday(activeTask.id, { date: todayKey() })}
                className="h-7 px-3 rounded-lg bg-primary text-on-primary text-body-sm font-semibold hover:bg-primary-container transition-colors"
              >
                Move to today
              </button>
              <button
                type="button"
                onClick={() => unlinkActiveTask(null)}
                className="h-7 px-2 rounded-lg text-on-surface-variant hover:text-on-surface text-body-sm font-medium transition-colors"
              >
                Unlink
              </button>
            </div>
          )}
        </div>

        <div className="bg-surface-container-low rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <Link
            href={session.phase === "FOCUS" ? "/focus" : "/break"}
            title="Open full-screen timer"
            className="flex items-center gap-5 rounded-lg group text-left"
          >
            <div className="flex flex-col">
              <div className={`font-mono text-[44px] leading-none font-semibold text-on-surface tracking-tight tabular-nums group-hover:text-primary transition-colors ${session.status === "PAUSED" ? "opacity-60" : ""}`}>
                {isInfinite ? formatElapsedHMS(totalElapsedMs) : formatClock(remainingSec)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-secondary text-label-xs">
                <span className="font-mono text-code-badge font-medium text-on-surface">
                  {elapsedMin}m {String(elapsedSec).padStart(2, "0")}s
                </span>
                {isInfinite ? (
                  <>elapsed • no fixed end</>
                ) : (
                  <>elapsed of {plannedMin}m session</>
                )}
                <span className="inline-flex items-center gap-0.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icon name="open_in_full" className="text-[12px]" />
                  Full screen
                </span>
              </div>
            </div>
            <div className="relative w-14 h-14 hidden sm:flex items-center justify-center flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
                <circle className="text-surface-variant" cx="24" cy="24" fill="none" r={R} stroke="currentColor" strokeWidth="3" />
                <circle
                  className="text-primary transition-all duration-500"
                  cx="24" cy="24" fill="none" r={R} stroke="currentColor"
                  strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - ringPct / 100)}
                  strokeLinecap="round" strokeWidth="3"
                />
              </svg>
              <span className="absolute font-mono text-code-badge font-semibold text-primary">{ringPct}%</span>
            </div>
          </Link>

          <div className="flex flex-col gap-1.5 min-w-[200px]">
            {isInfinite ? (
            <>
              <div className="flex items-center justify-between text-secondary text-label-xs">
                <span className="font-medium text-on-surface">Infinite Focus</span>
                <span className="font-mono text-code-badge text-primary font-semibold">Elapsed</span>
              </div>
              <span className="text-label-xs text-on-surface-variant">
                {session.status === "PAUSED"
                  ? "Paused — resume when ready"
                  : "Pause anytime — time stays saved"}
              </span>
            </>
            ) : (
            <>
            <div className="flex items-center justify-between text-secondary text-label-xs">
              <span className="font-medium text-on-surface">Pomodoro {currentIdx + 1} of {totalCount}</span>
              <span className="font-mono text-code-badge text-primary font-semibold">{currentSliceMin}m Block</span>
            </div>
            <div className="flex items-center gap-1.5 py-1">
              {Array.from({ length: totalCount }).map((_, i) => {
                if (i < doneCount) {
                  return (
                    <div key={i} className="w-3 h-3 rounded-full bg-primary flex items-center justify-center text-on-primary">
                      <Icon name="check" className="text-[10px] font-bold" />
                    </div>
                  );
                }
                if (i === currentIdx && ticking) {
                  return <div key={i} className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary-fixed animate-pulse" />;
                }
                return <div key={i} className="w-3 h-3 rounded-full bg-surface-container-highest" />;
              })}
            </div>
            <span className="text-label-xs text-on-surface-variant">
              Long break ({Math.round(effBreaks.longBreakMs / 60000)} min) after Pomodoro {effBreaks.longBreakInterval}
            </span>
            </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {session.status === "IDLE" && <Button onClick={startPrimary}>Start</Button>}
            {session.status === "IDLE" && !isInfinite && (activeTask ?? displayTask) && (
              <button
                type="button"
                onClick={() => setQuickOpen((v) => !v)}
                title="Start a shorter quick block instead of the full slice"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-body-sm font-medium transition-colors"
              >
                <Icon name="bolt" className="text-[16px]" />
                <span>Short on time?</span>
              </button>
            )}
            {session.status === "RUNNING" && (
              <button
                type="button"
                onClick={pause}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-on-surface text-surface text-body-sm font-medium hover:brightness-110 shadow-sm transition-all active:scale-95"
              >
                <Icon name="pause" className="text-[18px]" />
                <span>Pause</span>
                <kbd className="hidden min-[400px]:inline-block px-1.5 py-0.5 rounded bg-black/15 text-surface font-mono text-[10px] ml-1 shadow-sm font-semibold">Space</kbd>
              </button>
            )}
            {session.status === "PAUSED" && (
              <button
                type="button"
                onClick={resume}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-on-primary text-body-sm font-medium hover:bg-primary-container shadow-sm transition-all active:scale-95"
              >
                <Icon name="play_arrow" className="text-[18px]" />
                <span>Resume</span>
                <kbd className="hidden min-[400px]:inline-block px-1.5 py-0.5 rounded bg-black/15 text-on-primary font-mono text-[10px] ml-1 shadow-sm font-semibold">Space</kbd>
              </button>
            )}
            {(session.status === "RUNNING" || session.status === "PAUSED") && (
              <button
                type="button"
                onClick={() => {
                  const wasFocus = session.phase === "FOCUS";
                  handleComplete();
                  if (wasFocus) router.push("/complete");
                }}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-surface-container-lowest text-on-surface text-body-sm font-medium hover:bg-surface-container-high transition-colors shadow-sm"
              >
                <Icon name="stop_circle" className="text-[18px] text-error" />
                <span>End Session</span>
              </button>
            )}
            {ticking && (
              <button
                type="button"
                onClick={() => setConfirmingDiscard(true)}
                title="Discard the current session"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/15 text-body-sm font-medium transition-colors"
              >
                <Icon name="delete" className="text-[18px]" />
                <span>Discard</span>
              </button>
            )}
            {ticking && !replacing && (
              <button
                type="button"
                onClick={() => setReplacing(true)}
                title="Start a new session with a different name"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-body-sm font-medium transition-colors"
              >
                <Icon name="add" className="text-[18px]" />
                <span>New</span>
              </button>
            )}
            {(session.status === "COMPLETED" || session.status === "CANCELLED") && (
              <Button onClick={startPrimary}>Start next</Button>
            )}
            {isInfinite && (activeTask ?? displayTask) && (ticking || totalElapsedMs > 0) && (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                title="Reset infinite timer to 00:00:00"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/15 text-body-sm font-medium transition-colors"
              >
                <Icon name="restart_alt" className="text-[18px]" />
                <span>Reset timer</span>
              </button>
            )}
          </div>
          <ConfirmDialog
            open={confirmingDiscard}
            title={`Discard "${title}"?`}
            message={`This stops the current session and returns the card to standby. ${elapsedMin}m ${String(elapsedSec).padStart(2, "0")}s of focused work stays in History as a cancelled session.`}
            confirmLabel="Discard session"
            onCancel={() => setConfirmingDiscard(false)}
            onConfirm={discardCurrent}
          />
          <ConfirmDialog
            open={confirmingReset}
            title={`Reset infinite timer?`}
            message={`This zeroes the visible timer (${elapsedMin}m ${String(elapsedSec).padStart(2, "0")}s) and clears this task's accumulated focus back to 00:00:00. Past sessions stay in History — only the task totals restart.`}
            confirmLabel="Reset to 00:00:00"
            onCancel={() => setConfirmingReset(false)}
            onConfirm={doResetInfinite}
          />
          <div className="flex items-center gap-0.5 flex-wrap">
            <button
              type="button"
              title="Extend 5 minutes"
              disabled={!ticking || isInfinite}
              onClick={() => extend(5)}
              className="h-8 px-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors font-mono text-code-badge font-medium inline-flex items-center gap-1 disabled:opacity-40"
            >
              <Icon name="more_time" className="text-[15px]" />
              <span>+5m</span>
            </button>
            <button
              type="button"
              title="Log quick interruption"
              disabled={!ticking}
              onClick={pause}
              className="h-8 px-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors font-mono text-code-badge font-medium inline-flex items-center gap-1 disabled:opacity-40"
            >
              <Icon name="flag" className="text-[15px]" />
              <span>Log Interruption</span>
            </button>
            <button
              type="button"
              title="Session Scratchpad"
              onClick={() => setNotesOpen((v) => !v)}
              className="h-8 px-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors font-mono text-code-badge font-medium inline-flex items-center gap-1"
            >
              <Icon name="edit_note" className="text-[15px]" />
              <span>Scratchpad</span>
            </button>
          </div>
        </div>

        {quickOpen && session.status === "IDLE" && (activeTask ?? displayTask) && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant">
            <span className="text-label-xs text-on-surface-variant">
              Quick block instead of the full {currentSliceMin}m slice — finished
              minutes count wherever you choose below.
            </span>
            <DurationPicker compact minutes={quickMinutes} onChange={setQuickMinutes} />
            <QuickCreditPicker
              tasks={creditCandidates}
              value={quickCredit}
              onChange={setQuickCredit}
            />
            <div className="flex items-center gap-2">
              <Button onClick={beginQuickBlock}>
                Start {quickMinutes}m quick block
                {quickCredit ? ` → ${quickCredit.taskTitle}` : " (separate)"}
              </Button>
              <button
                type="button"
                onClick={() => setQuickOpen(false)}
                className="h-8 px-3 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-body-sm font-medium transition-colors"
              >
                Keep full slice
              </button>
            </div>
          </div>
        )}

        {replacing && ticking && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant">
            <span className="text-label-xs text-on-surface-variant">
              Current run will be logged as cancelled — start fresh under a new name:
            </span>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") replaceCurrent();
                if (e.key === "Escape") setReplacing(false);
              }}
              placeholder="New session name (optional)"
              className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 text-body-sm focus:outline-none focus:border-primary"
            />
            <DurationPicker compact minutes={newMinutes} onChange={setNewMinutes} />
            <QuickCadenceFields
              shortBreakMin={newShortMin}
              longBreakMin={newLongMin}
              interval={newInterval}
              onShort={setNewShortMin}
              onLong={setNewLongMin}
              onInterval={setNewInterval}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={replaceCurrent}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-on-primary hover:bg-primary-container text-body-sm font-semibold transition-colors"
              >
                <Icon name="play_arrow" className="text-[16px]" />
                <span>Start new ({newMinutes}m)</span>
              </button>
              <button
                type="button"
                onClick={() => setReplacing(false)}
                className="h-8 px-3 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-body-sm font-medium transition-colors"
              >
                Keep current
              </button>
            </div>
          </div>
        )}

        {notesOpen && (
          <textarea
            value={note}
            onChange={(e) => saveNote(e.target.value)}
            rows={3}
            placeholder="Session scratchpad — autosaved on this device…"
            className="w-full rounded-lg border border-outline bg-surface-container-low px-3 py-2 text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
          />
        )}
      </div>
    </div>
  );
}
