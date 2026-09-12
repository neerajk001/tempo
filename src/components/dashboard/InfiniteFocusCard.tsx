"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import {
  useTaskStore,
  getFocusMode,
  getSessionLabel,
  getTaskFocusedMs,
  type Task,
} from "@/stores/task-store";
import { getElapsedFocusMs } from "@/lib/pomodoro-machine";
import { formatDurationMinutes } from "@/lib/utils";
import { formatElapsedHMS } from "@/components/pomodoro/FocusTimer";
import { useNow } from "@/hooks/useNow";
import { todayKey } from "@/lib/task-planning";
import { cn } from "@/lib/utils";

/** Open Infinite-mode tasks, preferring today's. */
function infiniteCandidates(tasks: Task[]): Task[] {
  const open = tasks.filter(
    (t) =>
      getFocusMode(t) === "infinite" &&
      t.status !== "COMPLETED" &&
      t.status !== "CANCELLED"
  );
  const todayOpen = open.filter((t) => t.date === todayKey());
  return todayOpen.length > 0 ? todayOpen : open;
}

/**
 * One-click entry point for open-ended focus: pick an Infinite task and
 * start/resume it. Switching preserves the live task's state and keeps a
 * single active timer (see `switchToTask`).
 */
export default function InfiniteFocusCard() {
  const router = useRouter();
  const session = usePomodoroStore((s) => s.session);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const focusMode = usePomodoroStore((s) => s.focusMode);
  const tasks = useTaskStore((s) => s.tasks);
  const switchToTask = useTaskStore((s) => s.switchToTask);

  const candidates = useMemo(() => infiniteCandidates(tasks), [tasks]);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const selected =
    candidates.find((t) => t.id === overrideId) ??
    candidates.find((t) => t.id === activeTaskId) ??
    candidates.find((t) => t.status === "IN_PROGRESS") ??
    candidates[0] ??
    null;

  const ticking = session.status === "RUNNING" || session.status === "PAUSED";
  const liveOnSelected = !!selected && selected.id === activeTaskId && ticking;
  const liveInfinite =
    ticking && (session.isInfinite === true || focusMode === "infinite");
  const now = useNow(liveOnSelected);
  const liveElapsedMs = liveOnSelected ? getElapsedFocusMs(session, now) : 0;
  const totalElapsedMs = selected
    ? getTaskFocusedMs(selected) + liveElapsedMs
    : 0;

  const begin = () => {
    if (!selected) return;
    if (liveOnSelected) {
      router.push("/focus");
      return;
    }
    // switchToTask saves any live run, preserves all progress, and resumes
    // the selected Infinite task from its exact prior state.
    switchToTask(selected.id);
    router.push("/focus");
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="all_inclusive" className="text-[18px] text-primary" />
          <span className="text-headline-md text-on-surface font-semibold">
            Infinite Focus
          </span>
        </div>
        <span className="font-mono text-code-badge text-on-primary-fixed bg-primary-fixed px-1.5 py-0.5 rounded font-semibold">
          Open-ended
        </span>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        No fixed end time — elapsed focus is tracked until you pause or end
        the session.
      </p>

      {selected ? (
        <>
          {candidates.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                Infinite task
              </span>
              <select
                value={selected.id}
                onChange={(e) => setOverrideId(e.target.value)}
                className="h-9 rounded-lg bg-surface-container-low border border-outline-variant/30 px-2 text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container max-w-full"
              >
                {candidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {getSessionLabel(t, t.title)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2">
            <div className="flex flex-col min-w-0">
              <span className="text-body-sm font-semibold text-on-surface truncate">
                {getSessionLabel(selected, selected.title)}
              </span>
              {selected.sessionName && (
                <span className="text-label-xs text-on-surface-variant truncate">
                  Task: {selected.title}
                </span>
              )}
            </div>
            <span
              className={cn(
                "font-mono text-code-badge font-semibold flex-shrink-0 tabular-nums",
                liveOnSelected ? "text-primary" : "text-on-surface-variant"
              )}
            >
              {liveOnSelected ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {formatElapsedHMS(totalElapsedMs)}
                </span>
              ) : totalElapsedMs > 0 ? (
                `${formatDurationMinutes(Math.round(totalElapsedMs / 60000))} so far`
              ) : (
                "Not started"
              )}
            </span>
          </div>
          {ticking && !liveOnSelected && (
            <p className="text-label-xs text-on-surface-variant">
              A session is live — switching saves its state first.
            </p>
          )}
          <button
            type="button"
            onClick={begin}
            className="h-9 px-3 rounded-lg bg-primary-container text-on-primary hover:bg-primary text-body-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Icon
              name={liveOnSelected ? "open_in_full" : ticking ? "swap_horiz" : "play_arrow"}
              className="text-[16px]"
            />
            <span>
              {liveOnSelected
                ? "Open Infinite Focus"
                : ticking
                  ? `Switch to ∞ ${getSessionLabel(selected, selected.title).slice(0, 24)}`
                  : "Start ∞ Infinite Focus"}
            </span>
            {!ticking && (
              <kbd className="font-mono text-[10px] bg-black/15 px-1 rounded">
                I
              </kbd>
            )}
          </button>
          {selected && totalElapsedMs > 0 && !liveOnSelected && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Reset "${getSessionLabel(selected, selected.title)}" timer to 00:00:00? Past sessions stay in History.`)) return;
                useTaskStore.getState().resetTaskProgress(selected.id);
              }}
              title="Reset infinite timer to 00:00:00"
              className="h-8 px-3 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 text-body-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Icon name="restart_alt" className="text-[16px]" />
              <span>Reset timer to 00:00:00</span>
            </button>
          )}
          {ticking && !liveOnSelected && (
            <Link
              href="/focus"
              className="h-8 px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-body-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span>
                {liveInfinite ? "Infinite live — open focus instead" : "Session live — open focus instead"}
              </span>
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="text-body-sm text-secondary rounded-lg bg-surface-container-low px-3 py-2">
            No Infinite tasks yet. Create one to start open-ended focus.
          </p>
          <Link
            href="/tasks"
            className="h-9 px-3 rounded-lg bg-primary-container text-on-primary hover:bg-primary text-body-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Icon name="add" className="text-[16px]" />
            <span>New Infinite Task</span>
          </Link>
        </>
      )}
    </div>
  );
}
