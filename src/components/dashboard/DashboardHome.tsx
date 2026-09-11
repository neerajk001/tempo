"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import MetricRibbon from "@/components/dashboard/MetricRibbon";
import FocusSessionCard from "@/components/dashboard/FocusSessionCard";
import QuickFocusCard from "@/components/dashboard/QuickFocusCard";
import ScheduleList from "@/components/dashboard/ScheduleList";
import { UpNextCard, PlannedActualCard, InterruptionLogCard, StandbyCard } from "@/components/dashboard/RailCards";
import { computeDashboardStats, localDateKey } from "@/lib/dashboard-stats";
import { countPlannedPomodoros, todayKey } from "@/lib/task-planning";
import { useTaskStore } from "@/stores/task-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { usePrefsStore } from "@/stores/prefs-store";
import { useDiversionStore } from "@/stores/diversion-store";

export default function DashboardHome() {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const diversions = useDiversionStore((s) => s.diversions);
  const session = usePomodoroStore((s) => s.session);
  const reviewPrompt = usePrefsStore((s) => s.reviewPrompt);
  const [nudgeOff, setNudgeOff] = useState(false);

  const today = todayKey();
  const todayTasks = tasks.filter((t) => t.date === today);
  const stats = computeDashboardStats(tasks, sessions, today);

  const todayDiversions = diversions.filter((x) => localDateKey(x.at) === today);
  const divMinutes = todayDiversions.reduce((s, x) => s + x.minutes, 0);
  const totalInterruptions = stats.interruptions + todayDiversions.length;
  const totalPausedMs = stats.pausedMs + divMinutes * 60000;

  const plannedPomodoros = todayTasks.reduce((s, t) => {
    try {
      return s + countPlannedPomodoros(t.allocatedMinutes, t.focusMinutes);
    } catch {
      return s;
    }
  }, 0);

  const yesterdayKey = localDateKey(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayFocused = sessions
    .filter((x) => x.phase === "FOCUS" && localDateKey(x.startedAt) === yesterdayKey)
    .reduce((s, x) => s + Math.max(0, x.focusedMs), 0);
  const rateDelta =
    yesterdayFocused > 0
      ? Math.round(((stats.focusedMinutes * 60000 - yesterdayFocused) / yesterdayFocused) * 1000) / 10
      : null;

  const autoRows = sessions
    .filter((x) => x.phase === "FOCUS" && localDateKey(x.startedAt) === today && x.interruptions > 0)
    .map((x) => ({
      id: x.id,
      title: `${x.taskTitle ?? "Focus session"} — ${x.interruptions} interruption${x.interruptions === 1 ? "" : "s"}`,
      detail: "",
      minutes: Math.max(1, Math.round(x.pausedMs / 60000)),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const flowActive = session.status === "RUNNING" || session.status === "PAUSED";
  const isEmpty = todayTasks.length === 0 && sessions.length === 0;

  // Dashboard timer shortcuts (the kbd hints on the focus card are real here).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (tag === "BUTTON" || tag === "A") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = usePomodoroStore.getState().session.status;
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        if (st === "RUNNING") usePomodoroStore.getState().pause();
        else if (st === "PAUSED") usePomodoroStore.getState().resume();
      } else if (e.code === "KeyR") {
        if (!e.repeat && st === "PAUSED") usePomodoroStore.getState().resume();
      } else if (e.code === "KeyF") {
        router.push("/focus");
      } else if (e.code === "KeyQ") {
        // Allocation-free quick focus with workspace defaults.
        if (!e.repeat && st === "IDLE") {
          usePomodoroStore.getState().startQuick();
          router.push("/focus");
        } else if (!e.repeat) {
          router.push("/focus");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader flowActive={flowActive} />

      {reviewPrompt && !nudgeOff && new Date().getHours() >= 18 && stats.focusedMinutes > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-primary-fixed/40 border border-primary-fixed px-4 py-3">
          <p className="text-body-sm text-on-surface">
            <span className="font-semibold">Wrap up the day:</span> review what shipped, what slipped, and stage tomorrow.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/review" className="h-8 px-3 rounded-lg bg-primary text-on-primary text-body-sm font-medium inline-flex items-center">
              Open review
            </Link>
            <button type="button" onClick={() => setNudgeOff(true)} className="text-secondary hover:text-on-surface text-lg leading-none" title="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}

      <MetricRibbon
        d={{
          plannedMinutes: stats.plannedMinutes,
          focusedMinutes: stats.focusedMinutes,
          remainingMinutes: stats.remainingMinutes,
          completedPomodoros: stats.completedPomodoros,
          plannedPomodoros,
          interruptions: totalInterruptions,
          pausedMs: totalPausedMs,
          focusRate: stats.focusRate,
          rateDelta,
        }}
      />

      {isEmpty ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6">
            <p className="text-body-md font-medium text-on-surface">Nothing tracked yet.</p>
            <p className="mt-1 text-body-sm text-secondary">
              Create a task or connect Google Calendar to plan your day — or
              just start a pomodoro with no allocation.
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <Link href="/tasks" className="h-8 px-3 rounded-lg bg-primary text-on-primary text-body-sm font-medium inline-flex items-center">
                Create a task
              </Link>
              <Link href="/calendar" className="h-8 px-3 rounded-lg bg-surface-container border border-outline text-body-sm font-medium inline-flex items-center">
                Connect calendar
              </Link>
            </div>
          </div>
          <div className="lg:col-span-4">
            <QuickFocusCard />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 flex flex-col gap-6 min-w-0 lg:sticky lg:top-6">
            <FocusSessionCard />
            <ScheduleList tasks={todayTasks} />
          </div>
          <div className="lg:col-span-4 flex flex-col gap-4 min-w-0 lg:sticky lg:top-6">
            <QuickFocusCard />
            <UpNextCard tasks={todayTasks} />
            <PlannedActualCard
              plannedMinutes={stats.plannedMinutes}
              focusedMinutes={stats.focusedMinutes}
              remainingMinutes={stats.remainingMinutes}
              focusRate={stats.focusRate}
            />
            <InterruptionLogCard autoRows={autoRows} pausedMs={stats.pausedMs} />
            <StandbyCard />
          </div>
        </div>
      )}
    </div>
  );
}
