"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { getTaskProgress, nextSliceMinutes } from "@/lib/task-planning";
import { formatDurationMinutes } from "@/lib/utils";
import { useTaskStore, type Task } from "@/stores/task-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { usePrefsStore } from "@/stores/prefs-store";
import type { TaskPriority } from "@/types";
import { cn } from "@/lib/utils";

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function PriorityChip({ priority }: { priority: TaskPriority }) {
  if (priority === "urgent") {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-error/15 text-error border border-error/25">
        <Icon name="priority_high" className="text-[13px]" />
        Urgent
      </span>
    );
  }
  if (priority === "high") {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
        <Icon name="arrow_upward" className="text-[13px] text-tertiary" />
        High
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-surface-container text-on-surface-variant capitalize">
      {priority}
    </span>
  );
}

export function StatusChip({ task, now }: { task: Task; now: number }) {
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const timerStatus = usePomodoroStore((s) => s.session.status);
  const linked = task.id === activeTaskId;
  // A live timer takes precedence — a running session must never look stranded.
  if (linked && timerStatus === "PAUSED") {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-outline" />
        Paused
      </span>
    );
  }
  if (linked && timerStatus === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-secondary-container text-on-secondary-fixed">
        <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container animate-ping" />
        In Progress
      </span>
    );
  }
  if (task.status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-surface-container text-secondary">
        Done
      </span>
    );
  }
  if (task.status === "CANCELLED") {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-surface-container text-secondary">
        Cancelled
      </span>
    );
  }
  if (linked || task.status === "IN_PROGRESS") {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-secondary-container text-on-secondary-fixed">
        <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container animate-ping" />
        In Progress
      </span>
    );
  }
  if (task.startMs && task.startMs > now) {
    return (
      <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
        <Icon name="schedule" className="text-[12px]" />
        {new Date(task.startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-label-xs font-medium px-2 py-0.5 rounded bg-surface-container text-secondary">
      Scheduled
    </span>
  );
}

function PrimaryAction({ task }: { task: Task }) {
  const router = useRouter();
  const session = usePomodoroStore((s) => s.session);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const startForTask = usePomodoroStore((s) => s.startForTask);
  const resume = usePomodoroStore((s) => s.resume);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const setStatus = useTaskStore((s) => s.setStatus);

  const linked = task.id === activeTaskId;
  const live = linked && (session.status === "RUNNING" || session.status === "PAUSED");
  if ((task.status === "COMPLETED" || task.status === "CANCELLED") && !live) return null;
  const busyElsewhere =
    (session.status === "RUNNING" || session.status === "PAUSED") && !linked;

  if (linked && session.status === "RUNNING") {
    return (
      <button
        type="button"
        onClick={() => router.push("/focus")}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 md:h-7 md:px-3 rounded-lg bg-primary-container text-on-primary hover:bg-primary shadow-sm text-body-sm font-medium transition-colors"
      >
        <Icon name="play_arrow" className="text-[14px]" />
        <span className="hidden min-[420px]:inline">Open Focus</span>
      </button>
    );
  }
  if (linked && session.status === "PAUSED") {
    return (
      <button
        type="button"
        onClick={resume}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 md:h-7 md:px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-body-sm font-medium transition-colors"
      >
        <Icon name="replay" className="text-[14px]" />
        <span className="hidden min-[420px]:inline">Resume</span>
      </button>
    );
  }
  if (busyElsewhere) {
    return (
      <button
        type="button"
        onClick={() => {
          setActiveTask(task.id);
          if (task.status === "TODO") setStatus(task.id, "IN_PROGRESS");
        }}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 md:h-7 md:px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-body-sm font-medium transition-colors"
      >
        <Icon name="queue_play_next" className="text-[14px]" />
        <span className="hidden min-[420px]:inline">Queue Next</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (task.status === "TODO") setStatus(task.id, "IN_PROGRESS");
        startForTask(task.id, task.title, nextSliceMinutes(task.allocatedMinutes, task.focusMinutes, task.completedPomodoros) * 60000);
        router.push("/focus");
      }}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 md:h-7 md:px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-body-sm font-medium transition-colors"
    >
      <Icon name="play_arrow" className="text-[14px]" />
      <span className="hidden min-[420px]:inline">Start Focus</span>
    </button>
  );
}

export function TaskRow({
  task,
  now,
  onEdit,
}: {
  task: Task;
  now: number;
  onEdit: (t: Task) => void;
}) {
  const setStatus = useTaskStore((s) => s.setStatus);
  const removeTask = useTaskStore((s) => s.removeTask);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const timerLive = usePomodoroStore((s) => s.session.status === "RUNNING" || s.session.status === "PAUSED");
  const compact = usePrefsStore((s) => s.compact);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const loggedCount = useSessionHistoryStore((s) => s.sessions.filter((x) => x.taskId === task.id).length);
  const p = getTaskProgress(task.allocatedMinutes, task.focusedMinutes, task.focusMinutes);
  const done = task.status === "COMPLETED";
  const linked = task.id === activeTaskId;

  const toggleDone = () => {
    setStatus(task.id, done ? "TODO" : "COMPLETED");
  };

  return (
    <div className={cn(
      "grid grid-cols-12 gap-2 items-center px-4 sm:px-6 hover:bg-surface-container-low/50 transition-colors group relative",
      compact ? "py-2" : "py-3 md:py-4",
      linked && "bg-surface-container-low/20"
    )}>
      {linked && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-container" />}
      <div className="col-span-7 md:col-span-4 flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          title={done ? "Reopen task" : "Mark complete"}
          onClick={toggleDone}
          className={cn(
            "w-4 h-4 rounded-[3px] flex items-center justify-center flex-shrink-0 transition-colors",
            done ? "bg-secondary-container text-on-secondary-fixed" : "bg-surface-container-lowest shadow-sm hover:bg-surface-container"
          )}
        >
          {done ? (
            <Icon name="check" className="text-[12px] font-bold" />
          ) : (
            linked && <span className="w-2 h-2 rounded-[2px] bg-primary-container" />
          )}
        </button>
        <div className="flex flex-col min-w-0">
          <Link href={`/tasks/${task.id}`} className="text-body-md font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
            {task.title}
          </Link>
          {task.description && (
            <span className="text-label-xs text-on-surface-variant truncate">{task.description}</span>
          )}
        </div>
      </div>
      <div className="hidden md:flex md:col-span-2 items-center min-w-0">
        {task.project ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary-fixed/50 text-on-primary-fixed text-label-xs font-medium truncate max-w-full">
            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            <span className="truncate">{task.project}</span>
          </span>
        ) : (
          <span className="text-label-xs text-outline">—</span>
        )}
      </div>
      <div className="col-span-12 order-3 md:order-none md:col-span-2 flex flex-col justify-center">
        <div className="flex items-center justify-between text-label-xs font-mono mb-1">
          <span className={cn("font-semibold", p.percent > 0 ? "text-primary" : "text-on-surface-variant font-medium")}>
            {formatDurationMinutes(task.focusedMinutes)}
          </span>
          <span className="text-on-surface-variant font-normal">/ {formatDurationMinutes(task.allocatedMinutes)}</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div className={cn("h-full rounded-full", p.percent > 0 ? "bg-primary-container" : "bg-secondary-fixed-dim")} style={{ width: `${p.percent}%` }} />
        </div>
        <span className="font-mono text-label-xs text-on-surface-variant mt-0.5 text-right md:text-left">
          {p.percent}% • {formatDurationMinutes(p.remainingMinutes)} {p.percent >= 100 ? "done" : p.percent > 0 ? "left" : "remaining"}
        </span>
      </div>
      <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
        <PriorityChip priority={task.priority ?? "medium"} />
      </div>
      <div className="hidden md:flex md:col-span-1 items-center justify-center">
        <StatusChip task={task} now={now} />
      </div>
      <div className="col-span-5 order-2 md:order-none md:col-span-2 flex items-center justify-end gap-1">
        <PrimaryAction task={task} />
        {task.calendarEventId ? (
          <span title="Calendar synced" className="p-1 text-tertiary">
            <Icon name="event_available" className="text-[16px]" />
          </span>
        ) : (
          <a title="Sync with calendar" href="/calendar" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors hidden sm:inline-flex">
            <Icon name="sync" className="text-[16px]" />
          </a>
        )}
        <button
          type="button"
          title="Delete task"
          onClick={() => setConfirming(true)}
          className="p-2 md:p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/15 transition-colors"
        >
          <Icon name="delete" className="text-[16px]" />
        </button>
        <div className="relative">
          <button
            type="button"
            title="More options"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 md:p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <Icon name="more_horiz" className="text-[16px]" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 w-40 rounded-lg border border-outline bg-surface-container-lowest shadow-lg py-1 text-body-sm">
                {(
                  [
                    { label: "Edit", fn: () => onEdit(task) },
                    { label: task.status === "COMPLETED" ? "Reopen" : "Mark complete", fn: () => setStatus(task.id, task.status === "COMPLETED" ? "TODO" : "COMPLETED") },
                    { label: "Cancel task", fn: () => setStatus(task.id, "CANCELLED") },
                    { label: "Delete", fn: () => setConfirming(true) },
                  ] as Array<{ label: string; fn: () => void }>
                ).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      item.fn();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-on-surface"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        title={`Delete "${task.title}"?`}
        message={
          linked && timerLive
            ? "A live timer is running on this task. Deleting stops it immediately — partial progress is logged to History — and removes the task."
            : loggedCount > 0
              ? `This removes the task and clears its timer link. Its ${loggedCount} logged session${loggedCount === 1 ? "" : "s"} stay${loggedCount === 1 ? "s" : ""} in History.`
              : "This removes the task permanently. This cannot be undone."
        }
        confirmLabel="Delete task"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          removeTask(task.id);
        }}
      />
    </div>
  );
}

export function sortTasks(tasks: Task[], sort: string): Task[] {
  const arr = [...tasks];
  if (sort === "allocated") arr.sort((a, b) => b.allocatedMinutes - a.allocatedMinutes);
  else if (sort === "remaining")
    arr.sort((a, b) => b.allocatedMinutes - b.focusedMinutes - (a.allocatedMinutes - a.focusedMinutes));
  else if (sort === "priority") arr.sort((a, b) => PRIORITY_RANK[a.priority ?? "medium"] - PRIORITY_RANK[b.priority ?? "medium"]);
  else arr.sort((a, b) => b.createdAt - a.createdAt);
  return arr;
}
