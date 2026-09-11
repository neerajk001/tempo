"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import NewTaskModal from "@/components/tasks/NewTaskModal";
import { useTaskStore, selectTaskById } from "@/stores/task-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { useSessionHistoryStore, type SessionRecord } from "@/stores/session-history-store";
import { useNow } from "@/hooks/useNow";
import { useFinishSession } from "@/hooks/useFinishSession";
import { getRemainingMs } from "@/lib/pomodoro-machine";
import { calculatePomodoroPlan, nextSliceMinutes } from "@/lib/task-planning";
import { formatClock, formatDurationMinutes } from "@/lib/utils";
import { AVATAR_SRC } from "@/lib/assets";
import { cn } from "@/lib/utils";

function fmtHM(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function scoreOf(r: SessionRecord): number {
  if (r.plannedMs <= 0) return 0;
  return Math.min(100, Math.round((r.focusedMs / r.plannedMs) * 100));
}

export default function TaskDetails() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const tasks = useTaskStore((s) => s.tasks);
  const setStatus = useTaskStore((s) => s.setStatus);
  const removeTask = useTaskStore((s) => s.removeTask);
  const addSubtask = useTaskStore((s) => s.addSubtask);
  const toggleSubtask = useTaskStore((s) => s.toggleSubtask);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const pomodoro = usePomodoroStore((s) => s.session);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const pause = usePomodoroStore((s) => s.pause);
  const startForTask = usePomodoroStore((s) => s.startForTask);
  const { handleComplete } = useFinishSession();

  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [keyMoments, setKeyMoments] = useState(false);
  const [subInput, setSubInput] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);
  const subRef = useRef<HTMLInputElement>(null);

  const task = selectTaskById(tasks, params.id);
  const ticking = pomodoro.status === "RUNNING" || pomodoro.status === "PAUSED";
  const liveOnTask = !!task && task.id === activeTaskId && ticking;
  const now = useNow(liveOnTask);

  const records = useMemo(
    () => (task ? sessions.filter((x) => x.taskId === task.id && x.phase === "FOCUS").sort((a, b) => a.startedAt - b.startedAt) : []),
    [sessions, task]
  );
  const planLen = useMemo(() => {
    if (!task) return 1;
    try {
      return calculatePomodoroPlan(task.allocatedMinutes, task.focusMinutes).length;
    } catch {
      return 1;
    }
  }, [task]);

  const noteKey = task ? `tempo-scratch-${task.id}` : "";
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!task) return;
    try {
      setNote(window.localStorage.getItem(noteKey) ?? task.description ?? "");
    } catch {
      setNote(task.description ?? "");
    }
  }, [task, noteKey]);
  const saveNote = (v: string) => {
    setNote(v);
    try {
      window.localStorage.setItem(noteKey, v);
    } catch {
      // Optional.
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (editOpen) return;
      if (e.key === "Escape") {
        router.push("/tasks");
      } else if ((e.key === "f" || e.key === "F") && !inField) {
        focusNow();
      } else if ((e.key === "e" || e.key === "E") && !inField) {
        setEditOpen(true);
      } else if ((e.key === "s" || e.key === "S") && !inField) {
        e.preventDefault();
        subRef.current?.focus();
      } else if (e.key === "?") {
        setLegendOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, task, activeTaskId, pomodoro.status]);

  if (!task) {
    return (
      <div className="flex flex-col gap-4 max-w-md">
        <h1 className="text-headline-lg text-on-surface">Task not found</h1>
        <p className="text-body-sm text-secondary">It may have been deleted on another device.</p>
        <Link href="/tasks" className="text-body-sm underline">← Back to tasks</Link>
      </div>
    );
  }

  const sublist = task.subtasks ?? [];
  const doneSubs = sublist.filter((s) => s.done).length;
  const avgScore = records.length > 0 ? Math.round(records.reduce((s, r) => s + scoreOf(r), 0) / records.length) : 0;
  const remainingMin = Math.max(0, task.allocatedMinutes - task.focusedMinutes);
  const pct = task.allocatedMinutes > 0 ? Math.min(100, Math.round((task.focusedMinutes / task.allocatedMinutes) * 100)) : 0;
  const targetAt = new Date(Date.now() + remainingMin * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const kickoff = records[0]?.startedAt ?? task.startMs ?? task.createdAt;
  const shortId = `TSK-${task.id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0")}`;
  const dueLabel = task.endMs
    ? `Due ${new Date(task.endMs).toLocaleDateString("en-US", { weekday: "long" }) === new Date().toLocaleDateString("en-US", { weekday: "long" }) ? "today" : new Date(task.endMs).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${fmtHM(task.endMs)}`
    : `Due ${new Date(`${task.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const focusNow = () => {
    if (task.id === activeTaskId && ticking) {
      router.push("/focus");
      return;
    }
    if (task.status === "TODO") setStatus(task.id, "IN_PROGRESS");
    startForTask(task.id, task.title, nextSliceMinutes(task.allocatedMinutes, task.focusMinutes, task.completedPomodoros) * 60000);
    router.push("/focus");
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(`- [ ] ${task.title} (${formatDurationMinutes(task.focusedMinutes)}/${formatDurationMinutes(task.allocatedMinutes)})`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable.
    }
  };

  const shareTask = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      // Clipboard unavailable.
    }
  };

  const timeline = records
    .flatMap((r, ri) =>
      r.events.map((e) => ({ at: e.at, type: e.type, ri, record: r }))
    )
    .sort((a, b) => b.at - a.at);
  const shownTimeline = keyMoments ? timeline.filter((e) => e.type === "START" || e.type === "COMPLETE" || e.type === "CANCEL") : timeline;

  const eventLabel = (type: string, ri: number, at: number): React.ReactNode => {
    const t = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    switch (type) {
      case "START":
        return (
          <>
            <span className="font-mono text-metric-mono-md font-semibold text-on-surface">{t}</span>
            <span className="text-body-sm font-medium text-on-surface">Session {ri + 1} initiated</span>
          </>
        );
      case "PAUSE":
        return (
          <>
            <span className="font-mono text-metric-mono-md text-on-surface-variant">{t}</span>
            <span className="text-body-sm text-on-surface-variant">Manual pause</span>
          </>
        );
      case "RESUME":
        return (
          <>
            <span className="font-mono text-metric-mono-md text-on-surface-variant">{t}</span>
            <span className="text-body-sm text-on-surface-variant">Resumed focus block</span>
          </>
        );
      case "COMPLETE": {
        const mins = Math.round((timeline.find((e) => e.type === "START" && e.ri === ri)?.record.focusedMs ?? 0) / 60000);
        return (
          <>
            <span className="font-mono text-metric-mono-md font-semibold text-on-surface">{t}</span>
            <span className="text-body-sm font-medium text-on-surface">Session {ri + 1} completed</span>
            <span className="font-mono text-code-badge bg-surface-container-low text-on-surface-variant px-1 py-0.5 rounded">+{mins}m logged</span>
          </>
        );
      }
      default:
        return (
          <>
            <span className="font-mono text-metric-mono-md text-on-surface-variant">{t}</span>
            <span className="text-body-sm text-on-surface-variant">Session {ri + 1} cancelled</span>
          </>
        );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/tasks" className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors text-body-sm group">
            <Icon name="arrow_back" className="text-[16px] group-hover:-translate-x-0.5 transition-transform" />
            <span>Tasks</span>
          </Link>
          <span className="text-outline-variant text-body-sm">/</span>
          <span className="font-mono text-code-badge bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded">{shortId}</span>
          <span className="text-outline-variant text-body-sm">/</span>
          <span className="text-body-sm text-on-surface font-medium truncate max-w-[280px]">{task.title}</span>
        </div>
        <div className="flex items-center gap-3">
          {liveOnTask && (
            <div className="flex items-center gap-1.5 text-label-xs text-on-surface-variant">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="font-mono text-metric-mono-md text-primary">Session {Math.min(task.completedPomodoros + 1, Math.max(planLen, 1))} active</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className="flex items-center gap-1.5 text-on-surface-variant font-mono text-code-badge bg-surface-container-low px-3 py-0.5 rounded"
          >
            <span>Press</span>
            <span className="bg-surface-container-lowest text-on-surface px-1 rounded shadow-sm font-semibold">?</span>
            <span>for keybinds</span>
          </button>
        </div>
      </div>
      {legendOpen && (
        <div className="flex items-center gap-4 flex-wrap text-label-xs text-secondary bg-surface-container-lowest rounded-lg px-4 py-2 shadow-sm">
          {([["F", "Focus now"], ["E", "Edit task"], ["S", "Add subtask"], ["Esc", "Back to tasks"]] as Array<[string, string]>).map(([k, label]) => (
            <span key={k} className="flex items-center gap-1">
              <kbd className="font-mono bg-surface-container px-1 py-px rounded text-[10px]">{k}</kbd> {label}
            </span>
          ))}
        </div>
      )}

      {/* Header card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {task.project && (
                <span className="text-label-xs font-medium px-3 py-0.5 rounded bg-surface-container-high text-on-secondary-fixed">
                  {task.project}
                </span>
              )}
              <span className={cn(
                "text-label-xs font-medium px-3 py-0.5 rounded flex items-center gap-1 border border-transparent",
                task.priority === "urgent" ? "bg-error/15 text-error border-error/25" : "bg-surface-container text-secondary"
              )}>
                {task.priority === "urgent" && <Icon name="flag" className="text-[13px]" />}
                {task.priority === "urgent" ? "Urgent / Priority 1" : task.priority[0].toUpperCase() + task.priority.slice(1)}
              </span>
              <span className="text-label-xs font-medium px-3 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant flex items-center gap-1">
                {task.status === "IN_PROGRESS" && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>}
                {task.status.replace("_", " ")}
              </span>
              <span className="font-mono text-code-badge text-on-surface-variant flex items-center gap-1 ml-1">
                <Icon name="schedule" className="text-[13px]" />
                {dueLabel}
              </span>
            </div>
            <h1 className="text-headline-lg text-on-surface tracking-tight font-semibold flex items-center gap-2">
              <span className="truncate">{task.title}</span>
              <button type="button" title={copied ? "Copied!" : "Copy task markdown reference"} onClick={copyMarkdown} className="text-on-surface-variant hover:text-on-surface transition-colors p-0.5 rounded hover:bg-surface-container flex-shrink-0">
                <Icon name={copied ? "check" : "content_copy"} className="text-[18px]" />
              </button>
            </h1>
          </div>
          <div className="flex items-center flex-wrap gap-1.5">
            <button
              type="button"
              onClick={focusNow}
              className="h-8 px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary text-body-sm font-medium flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Icon name="play_arrow" className="text-[16px]" />
              <span>{liveOnTask ? "Open Focus" : "Focus Now"}</span>
              <kbd className="font-mono text-code-badge bg-black/15 text-on-primary px-1 rounded py-0.5 ml-0.5">F</kbd>
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="h-8 px-4 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              <Icon name="edit" className="text-[16px]" />
              <span>Edit Task</span>
              <kbd className="font-mono text-code-badge bg-surface-container-highest text-on-surface-variant px-1 rounded py-0.5 ml-0.5">E</kbd>
            </button>
            <div className="h-6 w-px bg-surface-container-high mx-0.5 hidden sm:block" />
            <button
              type="button"
              title={shared ? "Link copied!" : "Share and export task"}
              onClick={shareTask}
              className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors"
            >
              <Icon name={shared ? "check" : "ios_share"} className="text-[18px]" />
            </button>
            <div className="relative">
              <button
                type="button"
                title="More options"
                onClick={() => setMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors"
              >
                <Icon name="more_horiz" className="text-[18px]" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 w-44 rounded-lg border border-outline bg-surface-container-lowest shadow-lg py-1 text-body-sm">
                    {(
                      [
                        { label: "Mark complete", fn: () => setStatus(task.id, "COMPLETED") },
                        { label: "Cancel task", fn: () => setStatus(task.id, "CANCELLED") },
                        { label: "Reopen", fn: () => setStatus(task.id, "TODO") },
                        {
                          label: "Delete", fn: () => {
                            removeTask(task.id);
                            router.push("/tasks");
                          },
                        },
                      ] as Array<{ label: string; fn: () => void }>
                    ).map((item) => (
                      <button key={item.label} type="button" onClick={() => { item.fn(); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-on-surface">
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
          <div className="bg-surface-container-low p-3 rounded-lg flex flex-col justify-between">
            <span className="text-label-xs text-on-surface-variant uppercase tracking-wider font-medium">Allocated Horizon</span>
            <span className="font-mono text-metric-mono-lg text-on-surface font-medium mt-1 tabular-nums">
              {String(Math.floor(task.allocatedMinutes / 60)).padStart(2, "0")}<span className="text-body-sm text-on-surface-variant">h</span> {String(task.allocatedMinutes % 60).padStart(2, "0")}<span className="text-body-sm text-on-surface-variant">m</span>
            </span>
          </div>
          <div className="bg-primary-fixed/30 p-3 rounded-lg flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-label-xs text-primary font-semibold uppercase tracking-wider">Deep Work Focused</span>
              <Icon name="timer" className="text-primary text-[15px]" />
            </div>
            <span className="font-mono text-metric-mono-lg text-primary font-medium mt-1 tabular-nums">
              {String(Math.floor(task.focusedMinutes / 60)).padStart(2, "0")}<span className="text-body-sm font-medium">h</span> {String(task.focusedMinutes % 60).padStart(2, "0")}<span className="text-body-sm font-medium">m</span>
            </span>
          </div>
          <div className="bg-surface-container-low p-3 rounded-lg flex flex-col justify-between">
            <span className="text-label-xs text-on-surface-variant uppercase tracking-wider font-medium">Remaining Estimate</span>
            <span className="font-mono text-metric-mono-lg text-on-surface font-medium mt-1 tabular-nums">
              {String(Math.floor(remainingMin / 60)).padStart(2, "0")}<span className="text-body-sm text-on-surface-variant">h</span> {String(remainingMin % 60).padStart(2, "0")}<span className="text-body-sm text-on-surface-variant">m</span>
            </span>
          </div>
          <div className="bg-surface-container-low p-3 rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-label-xs text-on-surface-variant uppercase tracking-wider font-medium">Pomodoro Cycles</span>
              <span className="font-mono text-code-badge text-on-surface font-medium">{Math.min(task.completedPomodoros, Math.max(planLen, 1))} / {Math.max(planLen, 1)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {Array.from({ length: Math.max(planLen, 1) }).map((_, i) => (
                <span key={i} className={cn(
                  "w-3.5 h-3.5 rounded flex items-center justify-center",
                  i < task.completedPomodoros ? "bg-primary text-on-primary" : i === task.completedPomodoros && liveOnTask ? "bg-primary ring-2 ring-primary-fixed-dim ring-offset-1 animate-pulse" : "bg-surface-container-high"
                )}>
                  {i < task.completedPomodoros && <Icon name="check" className="text-[10px]" />}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Trajectory */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-metric-mono-lg text-on-surface font-semibold tabular-nums">{formatDurationMinutes(task.focusedMinutes)}</span>
            <span className="text-body-md text-on-surface-variant font-normal">of {formatDurationMinutes(task.allocatedMinutes)} target allocated</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-label-xs font-semibold px-1.5 py-0.5 rounded bg-surface-container text-primary">{pct}% Completed</span>
            <span className="text-body-sm text-on-surface-variant flex items-center gap-0.5">
              <Icon name="trending_up" className="text-[16px] text-tertiary" />
              Target completion ~{new Date(Date.now() + remainingMin * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          </div>
        </div>
        <div className="w-full relative h-3 rounded-full bg-surface-container overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          <div className="absolute inset-0 flex justify-between px-1 pointer-events-none opacity-30">
            {Array.from({ length: Math.max(Math.min(planLen, 8) - 1, 0) }).map((_, i) => (
              <span key={i} className="w-0.5 h-full bg-surface-container-lowest" />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-label-xs text-on-surface-variant px-0.5">
          <span>{new Date(kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (Kickoff)</span>
          {liveOnTask && (
            <span className="font-mono text-metric-mono-md text-primary font-semibold">
              P{Math.min(task.completedPomodoros + 1, Math.max(planLen, 1))} Active (~{Math.ceil(getRemainingMs(pomodoro, Date.now()) / 60000)}m remaining in current focus)
            </span>
          )}
          <span>Target: {new Date(Date.now() + remainingMin * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4 min-w-0">
          {/* Live banner */}
          {liveOnTask && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-primary" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary-fixed/60 text-primary flex items-center justify-center flex-shrink-0">
                    <Icon name="motion_photos_on" className="text-[20px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-headline-md text-on-surface">Pomodoro {Math.min(task.completedPomodoros + 1, Math.max(planLen, 1))} (In Progress)</span>
                      <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    </div>
                    {task.description && (
                      <span className="text-body-sm text-on-surface-variant truncate">Focus target: {task.description}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="flex flex-col items-end">
                    <LiveRemaining />
                    <span className="text-label-xs text-on-surface-variant">of {Math.round(pomodoro.plannedMs / 60000)}m block</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button type="button" title="Pause session" onClick={pause} className="h-8 w-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors">
                      <Icon name={pomodoro.status === "PAUSED" ? "play_arrow" : "pause"} className="text-[18px]" />
                    </button>
                    <button type="button" onClick={handleComplete} className="h-8 px-3 rounded-lg bg-surface-container-highest hover:bg-primary-fixed text-on-surface text-body-sm font-medium flex items-center gap-1 transition-colors">
                      <Icon name="check" className="text-[16px]" />
                      <span>Complete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audit log */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-headline-md text-on-surface font-semibold">Session Audit Log</h2>
                <span className="font-mono text-code-badge bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded">{records.length} total</span>
              </div>
              <div className="flex items-center gap-1.5 text-label-xs text-on-surface-variant">
                <span>Avg Focus Score:</span>
                <span className="font-mono text-metric-mono-md text-on-surface font-semibold">{records.length ? `${avgScore}%` : "—"}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {records.length === 0 && (
                <p className="text-body-sm text-secondary p-2">No focus sessions logged for this task yet.</p>
              )}
              {records.map((r, i) => (
                <Link key={r.id} href={`/history/${r.id}`} className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-surface-container-low transition-colors group">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-md bg-secondary-container text-on-secondary-fixed font-mono text-[12px] flex items-center justify-center font-semibold flex-shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-body-sm font-semibold text-on-surface truncate">Pomodoro {i + 1}</span>
                        <span className="font-mono text-code-badge bg-surface-container-high text-on-surface-variant px-1 py-0.5 rounded flex-shrink-0">{Math.round(r.focusedMs / 60000)}m</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-label-xs text-on-surface-variant flex-wrap">
                        <span>{fmtHM(r.startedAt)} — {fmtHM(r.endedAt)}</span>
                        <span>•</span>
                        <span className={r.interruptions > 1 ? "text-error font-medium" : ""}>
                          {r.interruptions === 0 ? "0 interruptions" : `${r.interruptions} interruption${r.interruptions === 1 ? "" : "s"}`}
                        </span>
                        <span>•</span>
                        <span className="text-tertiary font-medium">Focus Score {scoreOf(r)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-label-xs bg-surface-container-high text-on-secondary-fixed px-1.5 py-0.5 rounded font-medium">Completed</span>
                    <span className="p-0.5 text-on-surface-variant group-hover:text-on-surface transition-colors">
                      <Icon name="chevron_right" className="text-[18px]" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h2 className="text-headline-md text-on-surface font-semibold">Execution Timeline</h2>
                <span className="font-mono text-code-badge bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded">Audit Trace</span>
              </div>
              <button type="button" onClick={() => setKeyMoments((v) => !v)} className="text-label-xs text-primary hover:underline flex items-center gap-0.5">
                <span>{keyMoments ? "Show all" : "Key moments"}</span>
                <Icon name="tune" className="text-[14px]" />
              </button>
            </div>
            {shownTimeline.length === 0 ? (
              <p className="text-body-sm text-secondary">No events recorded yet — start a focus block.</p>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container-high">
                {shownTimeline.map((e, idx) => (
                  <div key={`${e.at}-${idx}`} className="relative flex items-start gap-2 group">
                    <span className={cn(
                      "absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-surface-container-lowest",
                      e.type === "COMPLETE" ? "bg-primary" : e.type === "START" ? "bg-secondary" : "bg-surface-container-highest"
                    )} />
                    <div className="flex items-center gap-1.5 flex-wrap">{eventLabel(e.type, e.ri, e.at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
          {/* Subtasks */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center gap-1.5">
                <Icon name="checklist" className="text-[18px] text-on-surface-variant" />
                <h3 className="text-headline-md text-on-surface font-semibold">Subtasks</h3>
              </div>
              <span className="font-mono text-metric-mono-md text-primary font-medium">{doneSubs} / {sublist.length} completed</span>
            </div>
            <div className="flex flex-col gap-1">
              {sublist.map((st) => (
                <label key={st.id} className={cn("flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-surface transition-colors cursor-pointer group", !st.done && "bg-surface-container-low")}>
                  <input
                    type="checkbox"
                    checked={st.done}
                    onChange={() => toggleSubtask(task.id, st.id)}
                    className="mt-1 h-4 w-4 rounded accent-primary bg-surface-container cursor-pointer"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={cn("text-body-sm select-none truncate", st.done ? "text-on-surface-variant line-through" : "font-medium text-on-surface")}>{st.title}</span>
                    {st.done && <span className="text-label-xs text-secondary-fixed-dim">Done</span>}
                  </div>
                  <button
                    type="button"
                    title="Remove subtask"
                    onClick={(e) => {
                      e.preventDefault();
                      useTaskStore.getState().removeSubtask(task.id, st.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-secondary hover:text-error text-sm leading-none"
                  >
                    ×
                  </button>
                </label>
              ))}
            </div>
            <form
              className="flex gap-1.5 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!subInput.trim()) return;
                try {
                  addSubtask(task.id, subInput);
                  setSubInput("");
                } catch {
                  // Validation message unnecessary inline; input constraints apply.
                }
              }}
            >
              <input
                ref={subRef}
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                placeholder="Add subtask"
                className="flex-1 min-w-0 h-8 rounded-lg bg-surface-container-low px-2.5 text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary-container"
              />
              <button type="submit" className="h-8 px-3 rounded-lg bg-surface hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-body-sm font-medium flex items-center gap-1 transition-colors">
                <Icon name="add" className="text-[16px]" />
                <span className="hidden sm:inline">Add</span>
              </button>
            </form>
          </div>

          {/* Scratchpad */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-2 flex-1">
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center gap-1.5">
                <Icon name="description" className="text-[18px] text-on-surface-variant" />
                <h3 className="text-headline-md text-on-surface font-semibold">Task Scratchpad</h3>
              </div>
              <button type="button" onClick={() => setNoteEditing((v) => !v)} className="text-label-xs text-on-surface-variant hover:text-on-surface flex items-center gap-0.5">
                <Icon name="open_in_full" className="text-[14px]" />
              </button>
            </div>
            {noteEditing ? (
              <textarea
                autoFocus
                value={note}
                onChange={(e) => saveNote(e.target.value)}
                onBlur={() => setNoteEditing(false)}
                rows={6}
                placeholder="Work notes, markdown welcome…"
                className="w-full bg-surface rounded-lg p-2.5 text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            ) : (
              <button type="button" onClick={() => setNoteEditing(true)} className="text-left bg-surface rounded-lg p-2.5 text-body-sm text-on-surface leading-relaxed whitespace-pre-wrap min-h-[96px] hover:ring-1 hover:ring-primary/30 transition-shadow">
                {note || <span className="text-on-surface-variant/60">Click to add notes or append markdown</span>}
              </button>
            )}
          </div>

          {/* Trace */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-2">
            <h3 className="text-headline-md text-on-surface font-semibold pb-0.5">Trace</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2.5 pt-1">
                <div className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={session?.user?.image ?? AVATAR_SRC} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="text-label-xs text-on-surface-variant">Created By</span>
                  <span className="text-body-sm font-medium text-on-surface">{session?.user?.name?.split(" ")[0] ?? "Neeraj"}</span>
                  <span className="text-label-xs text-on-surface-variant">
                    {new Date(task.createdAt).toLocaleDateString("en-US", { weekday: "long" })}, {new Date(task.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <NewTaskModal open={editOpen} initial={task} onClose={() => setEditOpen(false)} />
    </div>
  );
}

function LiveRemaining() {
  const pomodoro = usePomodoroStore((s) => s.session);
  const now = useNow(true);
  return (
    <span className="font-mono text-metric-mono-lg font-semibold text-primary tracking-tight tabular-nums">
      {formatClock(Math.ceil(getRemainingMs(pomodoro, now) / 1000))}
    </span>
  );
}
