"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { useTaskStore, selectTaskById } from "@/stores/task-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { useSessionHistoryStore, getRecordLabel, getSessionMode, type SessionRecord } from "@/stores/session-history-store";
import { cn } from "@/lib/utils";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function fmtHM(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtMS(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
function phaseLabel(phase: SessionRecord["phase"]): string {
  if (phase === "SHORT_BREAK") return "Short break";
  if (phase === "LONG_BREAK") return "Long break";
  return "Focus";
}

export function sessionYield(r: SessionRecord): number {
  // Infinite sessions have no planned target — any focused time is full yield.
  if (r.plannedMs <= 0) return r.focusedMs > 0 ? 100 : 0;
  return Math.min(100, Math.round((r.focusedMs / r.plannedMs) * 100));
}

export default function SessionInspector({
  record,
  context,
  onClose,
  onDeleted,
}: {
  record: SessionRecord;
  context?: { index: number; total: number };
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const removeSession = useSessionHistoryStore((s) => s.removeSession);

  const task = selectTaskById(tasks, record.taskId);
  const wallMs = Math.max(0, record.endedAt - record.startedAt);
  const y = sessionYield(record);

  const sorted = [...record.events].sort((a, b) => a.at - b.at);
  const atOf = (i: number) => sorted[i]?.at ?? record.endedAt;
  const pauseSpans: Array<{ at: number; ms: number }> = [];
  sorted.forEach((e, i) => {
    if (e.type === "PAUSE") {
      const next = sorted.slice(i + 1).find((x) => x.type === "RESUME" || x.type === "COMPLETE" || x.type === "CANCEL");
      pauseSpans.push({ at: e.at, ms: Math.max(0, (next ? next.at : record.endedAt) - e.at) });
    }
  });

  const rerun = () => {
    if (record.taskId && task) {
      // Resume the task from its preserved state (exact mode + progress).
      useTaskStore.getState().switchToTask(task.id);
    } else {
      // Preserve any live task run before the unlinked session preempts it.
      try {
        useTaskStore.getState().preserveActiveProgress();
      } catch {
        // Best-effort — the re-run still starts.
      }
      usePomodoroStore.getState().start(record.phase === "FOCUS" ? "FOCUS" : record.phase);
    }
    router.push("/focus");
  };
  const mode = getSessionMode(record);
  const label = getRecordLabel(record, record.taskTitle ?? "Focus Session");

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
        <div className="flex items-center gap-1.5">
          <Icon name="dock_to_left" className="text-[18px] text-primary" />
          <span className="text-headline-md text-on-surface font-semibold">Session details</span>
        </div>
        {onClose && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-code-badge bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">Esc</span>
            <button type="button" title="Close" onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface-container-low">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-code-badge text-on-surface-variant">
            {new Date(record.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {fmtHM(record.startedAt)} – {fmtHM(record.endedAt)}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded text-[11px] font-mono font-semibold",
            record.status === "COMPLETED" ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container-high text-secondary"
          )}>
            {record.status === "COMPLETED" ? "Completed" : "Ended early"}
          </span>
        </div>
        <h2 className="text-headline-md text-on-surface font-semibold leading-snug">{label}</h2>
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {task?.project && (
            <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-mono text-[11px] font-medium">{task.project}</span>
          )}
          {context && (
            <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[11px]">
              Session {context.index} of {context.total}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[11px]">{phaseLabel(record.phase)}</span>
          <span className={cn(
            "px-2 py-0.5 rounded font-mono text-[11px] font-medium",
            mode === "infinite" ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container text-on-surface-variant"
          )}>
            {mode === "infinite" ? "Infinite focus" : "Timed focus"}
          </span>
          {record.taskTitle && record.sessionName && record.sessionName.trim() && (
            <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[11px]">
              Task: {record.taskTitle}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="p-1.5 rounded-lg bg-surface-container-low flex flex-col">
          <span className="text-[10px] text-on-surface-variant uppercase font-medium">Total time</span>
          <span className="font-mono text-metric-mono-md text-on-surface font-semibold mt-1">{fmtMS(wallMs)}</span>
          <span className="text-[10px] text-on-surface-variant">start to finish</span>
        </div>
        <div className="p-1.5 rounded-lg bg-primary-fixed/30 flex flex-col">
          <span className="text-[10px] text-primary uppercase font-medium">Focused time</span>
          <span className="font-mono text-metric-mono-md text-primary font-semibold mt-1">{fmtMS(record.focusedMs)}</span>
          <span className="text-[10px] text-on-primary-fixed">{mode === "infinite" ? "Open-ended session" : `${y}% of the target`}</span>
        </div>
        <div className="p-1.5 rounded-lg bg-surface-container-low flex flex-col">
          <span className="text-[10px] text-accent-amber uppercase font-medium">{(record.breakMs ?? 0) > 0 ? "Break time" : "Paused time"}</span>
          <span className="font-mono text-metric-mono-md text-on-accent-amber font-semibold mt-1">
            {fmtMS((record.breakMs ?? 0) > 0 ? (record.breakMs ?? 0) : record.pausedMs)}
          </span>
          <span className="text-[10px] text-on-surface-variant">{record.interruptions} interruption{record.interruptions === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">What happened</span>
        <div className="relative pl-6 flex flex-col gap-2.5 pt-1 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-container-high">
          {sorted.map((e, i) => {
            const dot =
              e.type === "START" ? "bg-primary" :
              e.type === "PAUSE" ? "bg-accent-amber" :
              e.type === "RESUME" ? "bg-accent-yellow" : "bg-primary";
            const right =
              e.type === "START" ? <span className="text-[10px] text-on-primary-fixed font-medium">Focus started</span> :
              e.type === "PAUSE" ? <span className="text-[10px] text-on-accent-amber bg-accent-amber-container px-1 rounded">Paused for {fmtMS(atOf(i + 1) - e.at || record.pausedMs)}</span> :
              e.type === "RESUME" ? <span className="text-[10px] text-on-accent-yellow font-medium">Resumed</span> :
              e.type === "CANCEL" ? <span className="text-[10px] text-secondary font-medium">Ended early</span> :
              <span className="text-[10px] text-on-primary-fixed font-semibold">Finished</span>;
            const note =
              e.type === "START" ? "The timer started" :
              e.type === "PAUSE" ? "You paused the timer" :
              e.type === "RESUME" ? "You picked the session back up" :
              e.type === "COMPLETE" ? `Finished after ${fmtMS(record.focusedMs)} of focus` :
              "You ended this session before it finished";
            return (
              <div key={i} className="relative flex flex-col gap-0.5">
                <span className={cn("absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-surface-container-lowest", dot)} />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-code-badge text-on-surface font-medium">{fmtTime(e.at)}</span>
                  {right}
                </div>
                <p className="text-[12px] text-on-surface-variant leading-tight">{note}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-1 border-t border-outline-variant/20">
        <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">Linked task</span>
        {task ? (
          <Link href={`/tasks/${task.id}`} className="flex items-center justify-between p-1.5 rounded bg-surface-container-low text-body-sm hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon name="task_alt" className="text-[16px] text-primary" />
              <span className="truncate font-medium text-on-surface">{task.title}</span>
            </div>
            <span className="font-mono text-code-badge text-on-surface-variant">Open</span>
          </Link>
        ) : (
          <p className="text-body-sm text-secondary">This session wasn’t linked to a task.</p>
        )}
        {task?.description && (
          <p className="text-body-sm text-on-surface-variant leading-relaxed line-clamp-3">{task.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={rerun}
          className="flex-1 py-1.5 px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors text-body-sm font-medium flex items-center justify-center gap-1"
        >
          <Icon name="add_circle" className="text-[15px]" />
          <span>Start this again</span>
        </button>
        <Link
          href={record.taskId ? `/tasks/${record.taskId}` : "/tasks"}
          title="Open task"
          className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors"
        >
          <Icon name="edit" className="text-[18px]" />
        </Link>
        <button
          type="button"
          title="Delete session"
          onClick={() => {
            removeSession(record.id);
            onDeleted?.();
          }}
          className="p-1.5 rounded-lg bg-surface-container hover:bg-error/15 hover:text-error text-on-surface-variant transition-colors"
        >
          <Icon name="delete" className="text-[18px]" />
        </button>
      </div>

      <div className="p-3 rounded-xl bg-surface-container-lowest shadow-sm border border-outline bg-surface-container-lowest flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-10 h-10 flex items-center justify-center">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <path className="text-surface-container" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
              <path className="text-primary" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${y}, 100`} strokeLinecap="round" strokeWidth="3" />
            </svg>
            <span className="absolute font-mono text-[10px] font-semibold text-on-surface">{y}%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-body-sm font-semibold text-on-surface">Focus score</span>
            <span className="text-label-xs text-on-surface-variant">
              {mode === "infinite" ? "Open-ended session" : `You stayed focused for ${y}% of the planned time`}
            </span>
          </div>
        </div>
        <Icon name="military_tech" className="text-[20px] text-primary" />
      </div>
    </div>
  );
}
