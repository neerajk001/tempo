"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import {
  detectConflicts,
  generatePomodoroBlocks,
  planCoverage,
  subtractBusy,
  totalMs,
  type WorkBlock,
} from "@/lib/day-planner";
import { todayKey } from "@/lib/task-planning";
import { computeDashboardStats } from "@/lib/dashboard-stats";
import { formatDurationMinutes } from "@/lib/utils";
import { useTaskStore } from "@/stores/task-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";

type UIBlock = WorkBlock & { included: boolean };

function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function DayPlanner() {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const pomodoroConfig = usePomodoroStore((s) => s.config);
  const switchToTask = useTaskStore((s) => s.switchToTask);

  const todayTasks = useMemo(() => tasks.filter((t) => t.date === todayKey()), [tasks]);
  const [taskId, setTaskId] = useState<string>("");
  useEffect(() => {
    if (!taskId && todayTasks.length > 0) setTaskId(todayTasks[0].id);
  }, [taskId, todayTasks]);

  const stats = useMemo(() => computeDashboardStats(tasks, sessions, todayKey()), [tasks, sessions]);
  const taskStat = stats.perTask.find((p) => p.taskId === taskId);
  const task = todayTasks.find((t) => t.id === taskId);
  const remainingMs = (taskStat?.remainingMinutes ?? task?.allocatedMinutes ?? 0) * 60000;

  // Manual work window (works offline)
  const [manualStart, setManualStart] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return toLocalInput(d.getTime());
  });
  const [manualEnd, setManualEnd] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return toLocalInput(d.getTime());
  });

  const [focusMin, setFocusMin] = useState(() => Math.round(pomodoroConfig.focusMs / 60000));
  const [breakMin, setBreakMin] = useState(() => Math.round(pomodoroConfig.shortBreakMs / 60000));
  const [blocks, setBlocks] = useState<UIBlock[] | null>(null);

  const busy: Array<{ id: string; title: string; startMs: number; endMs: number }> = [];

  const container = { startMs: Date.parse(manualStart), endMs: Date.parse(manualEnd) };

  const free = useMemo(() => {
    if (!Number.isFinite(container.startMs) || !Number.isFinite(container.endMs) || container.endMs <= container.startMs) return [];
    return subtractBusy(container, busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualStart, manualEnd]);

  const generate = () => {
    if (free.length === 0 || remainingMs <= 0) {
      setBlocks([]);
      return;
    }
    setBlocks(
      generatePomodoroBlocks({ free, focusMs: focusMin * 60000, breakMs: breakMin * 60000, remainingMs }).map((b) => ({
        ...b,
        included: true,
      }))
    );
  };

  const included = useMemo(() => blocks?.filter((b) => b.included) ?? [], [blocks]);
  const conflicts = useMemo(() => (blocks ? detectConflicts(included, busy) : []), [blocks, included, busy]);
  const coverage = blocks ? planCoverage(included, remainingMs) : null;

  const shiftAll = (deltaMin: number) => {
    if (!blocks) return;
    const d = deltaMin * 60000;
    setBlocks(blocks.map((b) => ({ ...b, startMs: b.startMs + d, endMs: b.endMs + d })));
  };

  const startFirstFocus = () => {
    const first = included.find((b) => b.type === "focus");
    if (!first || !task) return;
    // switchToTask saves any live run, preserves all progress, and resumes
    // this task in its own focus mode (allocated slice vs infinite elapsed).
    switchToTask(task.id);
    router.push("/");
  };

  return (
    <div className="space-y-4">
      {todayTasks.length === 0 ? (
        <Card>
          <p className="text-sm font-medium">No tasks for today.</p>
          <p className="mt-1 text-sm text-on-surface-variant">Create a task first — the planner schedules its remaining work.</p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid gap-3 max-w-2xl">
              <label className="text-sm">
                <span className="text-on-surface-variant">Task</span>
                <select
                  className="mt-1 w-full rounded-md border border-outline bg-surface-container-low px-2 py-1.5 text-on-surface"
                  value={taskId}
                  onChange={(e) => {
                    setTaskId(e.target.value);
                    setBlocks(null);
                  }}
                >
                  {todayTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              {task && (
                <p className="text-xs text-on-surface-variant">
                  Allocated {formatDurationMinutes(task.allocatedMinutes)} · Done{" "}
                  {formatDurationMinutes(taskStat?.actualMinutes ?? 0)} · Remaining{" "}
                  {formatDurationMinutes(taskStat?.remainingMinutes ?? task.allocatedMinutes)}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="text-on-surface-variant">Window start</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-md border border-outline bg-surface-container-low px-2 py-1.5 text-on-surface"
                    value={manualStart}
                    onChange={(e) => {
                      setManualStart(e.target.value);
                      setBlocks(null);
                    }}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-on-surface-variant">Window end</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-md border border-outline bg-surface-container-low px-2 py-1.5 text-on-surface"
                    value={manualEnd}
                    onChange={(e) => {
                      setManualEnd(e.target.value);
                      setBlocks(null);
                    }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xs">
                <label className="text-sm">
                  <span className="text-on-surface-variant">Focus (min)</span>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    className="mt-1 w-full rounded-md border border-outline bg-surface-container-low px-2 py-1.5 text-on-surface"
                    value={focusMin}
                    onChange={(e) => setFocusMin(Number(e.target.value))}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-on-surface-variant">Break (min)</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className="mt-1 w-full rounded-md border border-outline bg-surface-container-low px-2 py-1.5 text-on-surface"
                    value={breakMin}
                    onChange={(e) => setBreakMin(Number(e.target.value))}
                  />
                </label>
              </div>
              <p className="text-xs text-on-surface-variant">
                Free in window: {formatDurationMinutes(Math.round(totalMs(free) / 60000))}
              </p>
              <div>
                <Button onClick={generate} disabled={remainingMs <= 0}>
                  Generate plan
                </Button>
                {remainingMs <= 0 && (
                  <span className="ml-2 text-xs text-on-surface-variant">Nothing remaining — task is fully covered.</span>
                )}
              </div>
            </div>
          </Card>

          {blocks !== null && (
            <Card>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-medium">Day plan</h2>
                <div className="flex gap-2 text-xs flex-wrap">
                  <Button variant="secondary" onClick={() => shiftAll(-15)}>
                    −15m
                  </Button>
                  <Button variant="secondary" onClick={() => shiftAll(15)}>
                    +15m
                  </Button>
                  <Button onClick={startFirstFocus} disabled={!included.some((b) => b.type === "focus")}>
                    Start first focus
                  </Button>
                </div>
              </div>

              {coverage && (
                <p className="mt-1 text-xs text-on-surface-variant">
                  Plan covers {formatDurationMinutes(Math.round(coverage.plannedFocusMs / 60000))} of{" "}
                  {formatDurationMinutes(Math.round(coverage.remainingMs / 60000))} remaining
                  {!coverage.coversAll &&
                    ` — short ${formatDurationMinutes(Math.round(coverage.shortfallMs / 60000))}; extend the window or trim other events`}
                </p>
              )}

              {blocks.length === 0 ? (
                <p className="mt-2 text-sm text-on-surface-variant">No free time in this window for the remaining work.</p>
              ) : (
                <ol className="mt-2 space-y-1.5 text-sm">
                  {blocks.map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={b.included}
                        onChange={() => setBlocks(blocks.map((x, j) => (j === i ? { ...x, included: !x.included } : x)))}
                        aria-label={`Include ${b.type} block ${i + 1}`}
                      />
                      <span className="tabular-nums text-on-surface-variant shrink-0">
                        {fmt(b.startMs)} ── {b.type === "focus" ? "Focus" : "Break"} ── {fmt(b.endMs)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${b.type === "focus" ? "bg-primary text-on-primary font-semibold" : "bg-accent-amber-container text-on-accent-amber"}`}>
                        {b.minutes}m{b.partial ? " · short" : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {conflicts.length > 0 && (
                <div className="mt-3 rounded-md border border-accent-amber/25 bg-accent-amber-container p-3 text-sm">
                  <p className="font-medium text-on-accent-amber">Conflict detected</p>
                  <ul className="mt-1 list-disc pl-5 text-on-surface">
                    {conflicts.map((c, i) => (
                      <li key={i}>
                        {fmt(c.block.startMs)}–{fmt(c.block.endMs)} {c.block.type} overlaps{" "}
                        {fmt(c.event.startMs)}–{fmt(c.event.endMs)} {c.event.title}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Adjust the plan (shift or uncheck blocks) to resolve the overlap.
                  </p>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
