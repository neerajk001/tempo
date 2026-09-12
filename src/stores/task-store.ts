"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FocusMode, PomodoroPhase, TaskPriority, TaskStatus } from "@/types";
import { nextSliceMinutes, todayKey } from "@/lib/task-planning";
import { getElapsedFocusMs } from "@/lib/pomodoro-machine";
import { addTaskTombstone } from "@/lib/tombstones";
import { usePomodoroStore } from "@/stores/pomodoro-store";

export const TASK_PROJECTS = ["Core Platform", "API Services", "Engineering", "Personal"] as const;
export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  doneAt: number | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  allocatedMinutes: number;
  focusMinutes: number;
  /** Per-task break cadence (null = use workspace defaults) */
  shortBreakMinutes?: number | null;
  longBreakMinutes?: number | null;
  longBreakInterval?: number | null;
  status: TaskStatus;
  /** actual focused minutes accumulated (Phase 04 will derive from session events) */
  focusedMinutes: number;
  completedPomodoros: number;
  /** Project / scope label */
  project?: string | null;
  priority: TaskPriority;
  /** Checklist items (absent on legacy tasks — treat as empty) */
  subtasks?: Subtask[];
  /** Google Calendar event ID when planned from Calendar (Phase 06) */
  calendarEventId?: string | null;
  /** Event bounds (ms) when planned from a Calendar event — drives the schedule */
  startMs?: number | null;
  endMs?: number | null;
  createdAt: number;
  updatedAt: number;
  /**
   * Focus scheduling mode. "allocated" = classic Pomodoro with fixed
   * allocation; "infinite" = open-ended focus with no fixed end time.
   * Absent on legacy tasks — treat as "allocated".
   */
  focusMode?: FocusMode;
  /**
   * User-provided label for an Infinite Focus session
   * (e.g. "JavaScript Deep Dive"). Null = fall back to task title.
   */
  sessionName?: string | null;
  /** Precise accumulated focused time in ms (superset of focusedMinutes). */
  focusedMs?: number;
  /** Accumulated break time in ms (infinite pause-breaks + preserved breaks). */
  breakMs?: number;
  /** Accumulated interruption count (pause events preserved across switches). */
  interruptions?: number;
  /**
   * Completed FOCUS sessions in this task's cycle — drives the long-break
   * interval and is preserved across task switches. Falls back to
   * completedPomodoros when absent.
   */
  completedFocusCount?: number;
  /** Phase the task was in when last switched away (preserves break state). */
  lastPhase?: PomodoroPhase | null;
}

export interface NewTaskInput {
  title: string;
  description?: string;
  date?: string;
  /** Required for allocated; optional (0 = none) for infinite. */
  allocatedMinutes?: number;
  focusMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
  longBreakInterval?: number;
  project?: string;
  priority?: TaskPriority;
  calendarEventId?: string;
  startMs?: number;
  endMs?: number;
  focusMode?: FocusMode;
  /** Display label for an Infinite Focus session. */
  sessionName?: string;
}

export type TaskPatch = Partial<
  Pick<Task, "title" | "description" | "date" | "allocatedMinutes" | "focusMinutes" | "project" | "priority" | "startMs" | "endMs" | "shortBreakMinutes" | "longBreakMinutes" | "longBreakInterval" | "focusMode" | "sessionName">
>;

/** Resolve a task's focus mode with legacy fallback. */
export function getFocusMode(t: Pick<Task, "focusMode"> | null | undefined): FocusMode {
  return t?.focusMode === "infinite" ? "infinite" : "allocated";
}

/** Display label for a task's session (infinite session name or title). */
export function getSessionLabel(t: Pick<Task, "title" | "sessionName"> | null | undefined, fallback = "Deep Work Session"): string {
  if (!t) return fallback;
  const named = (t.sessionName ?? "").trim();
  if (named) return named.slice(0, 200);
  return t.title || fallback;
}

/** Precise focused ms for a task (falls back to minutes-derived). */
export function getTaskFocusedMs(t: Pick<Task, "focusedMs" | "focusedMinutes">): number {
  if (typeof t.focusedMs === "number" && Number.isFinite(t.focusedMs)) return Math.max(0, Math.round(t.focusedMs));
  return Math.max(0, Math.round((t.focusedMinutes ?? 0) * 60000));
}

interface TaskActions {
  createTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: TaskPatch) => void;
  setStatus: (id: string, status: TaskStatus) => void;
  removeTask: (id: string) => void;
  addSubtask: (taskId: string, title: string) => Subtask;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  removeSubtask: (taskId: string, subtaskId: string) => void;
  recordFocus: (id: string, minutes: number) => void;
  /**
   * Precise accumulator for completion/switch saves. Updates focusedMs,
   * breakMs, interruptions and keeps minute counters in sync. Shared by
   * Allocated + Infinite so Dashboard/History stay consistent.
   */
  recordFocusMs: (id: string, focusedMsDelta: number, opts?: { breakMsDelta?: number; interruptionsDelta?: number }) => void;
  /**
   * Preserve a task's timer/session state when switching away or stopping.
   * Never resets — only accumulates and remembers phase/counts for resume.
   */
  accumulateProgress: (id: string, delta: ProgressDelta) => void;
  /**
   * Fold the currently-running timer's elapsed work into its linked task
   * (no reset). Safe to call before switching tasks or on unload. Returns
   * the preserved totals, or null when no live session needed saving.
   */
  preserveActiveProgress: (now?: number) => { taskId: string; focusedMs: number; breakMs: number; interruptions: number } | null;
  /**
   * Switch the active timer to another task:
   * 1) save current task's timer/session state, 2) stop its timer,
   * 3) preserve all progress, 4) start/resume the selected task.
   * Only one session actively runs at a time; previous time is never reset.
   */
  switchToTask: (id: string) => void;
  setActiveTask: (id: string | null) => void;
}

interface TaskStore extends TaskActions {
  tasks: Task[];
  activeTaskId: string | null;
}

const STORAGE_KEY = "tempo-tasks-v1";

const ssrSafeStorage = () => {
  if (typeof window !== "undefined") return localStorage;
  return {
    getItem: (_k: string) => null,
    setItem: (_k: string, _v: string) => {},
    removeItem: (_k: string) => {},
  };
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new Error("Task title is required");
  if (t.length > 200) throw new Error("Task title is too long (max 200)");
  return t;
}

function normalizeMinutes(v: number, field: string, min: number, max: number): number {
  if (!Number.isFinite(v)) throw new Error(`${field} must be a number`);
  const r = Math.round(v);
  if (r < min || r > max) throw new Error(`${field} must be between ${min} and ${max}`);
  return r;
}

function normalizePriority(p: unknown): TaskPriority {
  if (p === "urgent" || p === "high" || p === "medium" || p === "low") return p;
  return "medium";
}

function normalizeFocusMode(v: unknown): FocusMode {
  return v === "infinite" ? "infinite" : "allocated";
}

function normalizeSessionName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 200);
  return t || null;
}

export interface ProgressDelta {
  /** Additional focused time in ms to accumulate. */
  focusedMs?: number;
  /** Additional break time in ms to accumulate. */
  breakMs?: number;
  /** Additional interruptions to accumulate. */
  interruptions?: number;
  /** Absolute completed-focus count to preserve (max-wins). */
  completedFocusCount?: number;
  /** Phase to remember for break-state resume. */
  lastPhase?: PomodoroPhase | null;
}

function withProgressApplied(
  t: Task,
  delta: ProgressDelta
): Task {
  const focusedMs = Math.max(
    0,
    Math.round(getTaskFocusedMs(t) + Math.max(0, Math.round(delta.focusedMs ?? 0)))
  );
  const breakMs = Math.max(
    0,
    Math.round((t.breakMs ?? 0) + Math.max(0, Math.round(delta.breakMs ?? 0)))
  );
  const interruptions = Math.max(
    0,
    Math.round((t.interruptions ?? 0) + Math.max(0, Math.round(delta.interruptions ?? 0)))
  );
  // Keep minute counters in sync with precise ms so legacy views stay correct.
  const focusedMinutes = Math.round(focusedMs / 60000);
  const completedPomodoros =
    t.focusMinutes > 0 ? Math.floor(focusedMinutes / Math.max(1, Math.round(t.focusMinutes))) : 0;
  const completedFocusCount = Math.max(
    t.completedFocusCount ?? t.completedPomodoros ?? 0,
    delta.completedFocusCount ?? 0
  );
  const status: TaskStatus = t.status === "TODO" && (focusedMs > 0 || completedFocusCount > 0) ? "IN_PROGRESS" : t.status;
  return {
    ...t,
    focusedMs,
    breakMs,
    interruptions,
    focusedMinutes,
    completedPomodoros,
    completedFocusCount,
    ...(delta.lastPhase !== undefined ? { lastPhase: delta.lastPhase } : {}),
    status,
    updatedAt: Date.now(),
  };
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      activeTaskId: null,

      createTask: (input) => {
        const now = Date.now();
        const focusMode = normalizeFocusMode(input.focusMode);
        const sessionName = normalizeSessionName(input.sessionName);
        // Infinite = open-ended: no fixed end time required (0 = no allocation).
        // Allocated keeps the original strict validation (missing/non-numeric throws).
        const allocatedMinutes =
          focusMode === "infinite"
            ? input.allocatedMinutes === undefined || input.allocatedMinutes === null
              ? 0
              : (() => {
                  const r = Math.round(Number(input.allocatedMinutes));
                  if (!Number.isFinite(r) || r < 0 || r > 1440) throw new Error("Allocated time must be between 0 and 1440");
                  return r;
                })()
            : normalizeMinutes(input.allocatedMinutes as number, "Allocated time", 1, 1440);
        const task: Task = {
          id: uid(),
          title: normalizeTitle(input.title),
          description: (input.description ?? "").trim().slice(0, 2000),
          date: input.date ?? todayKey(),
          allocatedMinutes,
          focusMinutes: input.focusMinutes
            ? normalizeMinutes(input.focusMinutes, "Focus duration", 5, 180)
            : 50,
          shortBreakMinutes: input.shortBreakMinutes
            ? normalizeMinutes(input.shortBreakMinutes, "Short break", 1, 60)
            : null,
          longBreakMinutes: input.longBreakMinutes
            ? normalizeMinutes(input.longBreakMinutes, "Long break", 1, 120)
            : null,
          longBreakInterval: input.longBreakInterval
            ? normalizeMinutes(input.longBreakInterval, "Long break interval", 2, 12)
            : null,
          status: "TODO",
          focusedMinutes: 0,
          completedPomodoros: 0,
          project: (input.project ?? "").trim().slice(0, 60) || null,
          priority: normalizePriority(input.priority),
          subtasks: [],
          calendarEventId: input.calendarEventId ?? null,
          startMs: input.startMs ?? null,
          endMs: input.endMs ?? null,
          createdAt: now,
          updatedAt: now,
          focusMode,
          sessionName,
          focusedMs: 0,
          breakMs: 0,
          interruptions: 0,
          completedFocusCount: 0,
          lastPhase: null,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return task;
      },

      updateTask: (id, patch) => {
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            const next = { ...t, updatedAt: Date.now() };
            if (patch.title !== undefined) next.title = normalizeTitle(patch.title);
            if (patch.description !== undefined)
              next.description = patch.description.trim().slice(0, 2000);
            if (patch.date !== undefined) next.date = patch.date;
            if (patch.focusMode !== undefined) next.focusMode = normalizeFocusMode(patch.focusMode);
            if (patch.sessionName !== undefined) next.sessionName = normalizeSessionName(patch.sessionName);
            if (patch.allocatedMinutes !== undefined) {
              const mode = next.focusMode === "infinite" ? "infinite" : "allocated";
              next.allocatedMinutes =
                mode === "infinite"
                  ? (() => {
                      const r = Math.round(Number(patch.allocatedMinutes));
                      if (!Number.isFinite(r) || r < 0 || r > 1440) throw new Error("Allocated time must be between 0 and 1440");
                      return r;
                    })()
                  : normalizeMinutes(
                      patch.allocatedMinutes,
                      "Allocated time",
                      1,
                      1440
                    );
            }
            if (patch.focusMinutes !== undefined)
              next.focusMinutes = normalizeMinutes(patch.focusMinutes, "Focus duration", 5, 180);
            if (patch.shortBreakMinutes !== undefined)
              next.shortBreakMinutes = patch.shortBreakMinutes === null ? null : normalizeMinutes(patch.shortBreakMinutes, "Short break", 1, 60);
            if (patch.longBreakMinutes !== undefined)
              next.longBreakMinutes = patch.longBreakMinutes === null ? null : normalizeMinutes(patch.longBreakMinutes, "Long break", 1, 120);
            if (patch.longBreakInterval !== undefined)
              next.longBreakInterval = patch.longBreakInterval === null ? null : normalizeMinutes(patch.longBreakInterval, "Long break interval", 2, 12);
            if (patch.project !== undefined)
              next.project = (patch.project ?? "").trim().slice(0, 60) || null;
            if (patch.priority !== undefined) next.priority = normalizePriority(patch.priority);
            if (patch.startMs !== undefined) next.startMs = patch.startMs;
            if (patch.endMs !== undefined) next.endMs = patch.endMs;
            return next;
          }),
        }));
      },

      setStatus: (id, status) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, status, updatedAt: Date.now() } : t
          ),
        }));
      },

      removeTask: (id) => {
        // Stop + unlink the timer first so a deleted task never lingers on the dashboard.
        usePomodoroStore.getState().detachTask(id);
        // Remember the delete for cloud sync so other devices drop it too.
        addTaskTombstone(id);
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          activeTaskId: s.activeTaskId === id ? null : s.activeTaskId,
        }));
      },

      addSubtask: (taskId, title) => {
        const t = title.trim().slice(0, 120);
        if (!t) throw new Error("Subtask title is required");
        const sub: Subtask = { id: uid(), title: t, done: false, doneAt: null };
        set((s) => ({
          tasks: s.tasks.map((x) =>
            x.id === taskId
              ? { ...x, subtasks: [...(x.subtasks ?? []), sub], updatedAt: Date.now() }
              : x
          ),
        }));
        return sub;
      },

      toggleSubtask: (taskId, subtaskId) => {
        set((s) => ({
          tasks: s.tasks.map((x) => {
            if (x.id !== taskId) return x;
            return {
              ...x,
              updatedAt: Date.now(),
              subtasks: (x.subtasks ?? []).map((st) =>
                st.id === subtaskId
                  ? { ...st, done: !st.done, doneAt: !st.done ? Date.now() : null }
                  : st
              ),
            };
          }),
        }));
      },

      removeSubtask: (taskId, subtaskId) => {
        set((s) => ({
          tasks: s.tasks.map((x) =>
            x.id === taskId
              ? { ...x, subtasks: (x.subtasks ?? []).filter((st) => st.id !== subtaskId), updatedAt: Date.now() }
              : x
          ),
        }));
      },

      recordFocus: (id, minutes) => {
        const m = Math.max(0, Math.round(minutes));
        if (m === 0) return;
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            const focusedMinutes = t.focusedMinutes + m;
            const focusedMs = getTaskFocusedMs(t) + m * 60000;
            const completedPomodoros = Math.floor(focusedMinutes / t.focusMinutes);
            const completedFocusCount = Math.max(t.completedFocusCount ?? completedPomodoros, completedPomodoros);
            const status: TaskStatus =
              t.status === "TODO" ? "IN_PROGRESS" : t.status;
            return { ...t, focusedMinutes, focusedMs, completedPomodoros, completedFocusCount, status, updatedAt: Date.now() };
          }),
        }));
        void get;
      },

      recordFocusMs: (id, focusedMsDelta, opts) => {
        const f = Math.max(0, Math.round(focusedMsDelta));
        const b = Math.max(0, Math.round(opts?.breakMsDelta ?? 0));
        const intr = Math.max(0, Math.round(opts?.interruptionsDelta ?? 0));
        if (f === 0 && b === 0 && intr === 0) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? withProgressApplied(t, { focusedMs: f, breakMs: b, interruptions: intr })
              : t
          ),
        }));
      },

      accumulateProgress: (id, delta) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? withProgressApplied(t, delta) : t)),
        }));
      },

      preserveActiveProgress: (now) => {
        const at = now ?? Date.now();
        // task-store already depends on pomodoro-store (see removeTask),
        // so reading the live timer here keeps the engine centralized
        // without introducing a new import cycle.
        const pomo = usePomodoroStore.getState();
        const { session, activeTaskId } = pomo;
        if (!activeTaskId) return null;
        if (session.status !== "RUNNING" && session.status !== "PAUSED") return null;
        if (session.startedAt === null) return null;
        const focusedMs = Math.max(0, Math.round(getElapsedFocusMs(session, at)));
        // Pauses are manual — there is no automatic break countdown, so no
        // break time accrues here (paused time is tracked on the session).
        const breakMs = 0;
        const interruptions = Math.max(0, Math.round(session.pauseCount ?? 0));
        const completedFocusCount = Math.max(0, Math.round(session.completedFocusCount ?? 0));
        const lastPhase = session.phase;
        // Nothing meaningful to save (fresh start, no time yet) — still
        // remember cycle/phase so resume stays exact.
        if (focusedMs === 0 && breakMs === 0 && interruptions === 0) {
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === activeTaskId
                ? {
                    ...t,
                    completedFocusCount: Math.max(t.completedFocusCount ?? t.completedPomodoros ?? 0, completedFocusCount),
                    lastPhase,
                    updatedAt: Date.now(),
                  }
                : t
            ),
          }));
          return { taskId: activeTaskId, focusedMs: 0, breakMs: 0, interruptions: 0 };
        }
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === activeTaskId
              ? withProgressApplied(t, { focusedMs, breakMs, interruptions, completedFocusCount, lastPhase })
              : t
          ),
        }));
        return { taskId: activeTaskId, focusedMs, breakMs, interruptions };
      },

      switchToTask: (id) => {
        const target = get().tasks.find((t) => t.id === id);
        if (!target) return;
        const pomo = usePomodoroStore.getState();
        const live = pomo.session.status === "RUNNING" || pomo.session.status === "PAUSED";
        // Already the live task — continue from current state, never restart.
        if (live && pomo.activeTaskId === id) return;
        // 1) Save current task's timer/session state (never resets).
        if (live && pomo.activeTaskId && pomo.activeTaskId !== id) {
          try {
            get().preserveActiveProgress(Date.now());
          } catch {
            // Preservation is best-effort — switching must still proceed.
          }
        }
        // 2) Start/resume the selected task from its preserved state.
        //    startForTask preempts (single-active) and logs the old run.
        const mode = getFocusMode(target);
        const completedFocusCount =
          target.completedFocusCount ?? target.completedPomodoros ?? 0;
        if (target.status === "TODO") {
          get().setStatus(target.id, "IN_PROGRESS");
        }
        get().setActiveTask(target.id);
        if (mode === "infinite") {
          pomo.startForTask(target.id, target.title, undefined, {
            focusMode: "infinite",
            sessionName: target.sessionName ?? null,
            completedFocusCount,
          });
        } else {
          // Allocated: resume the exact slice implied by preserved progress.
          let sliceMin: number;
          try {
            sliceMin = nextSliceMinutes(
              target.allocatedMinutes,
              target.focusMinutes,
              target.completedPomodoros ?? 0
            );
          } catch {
            sliceMin = Math.max(1, Math.round(target.focusMinutes) || 25);
          }
          pomo.startForTask(target.id, target.title, sliceMin * 60000, {
            focusMode: "allocated",
            completedFocusCount,
          });
        }
      },

      setActiveTask: (id) => set({ activeTaskId: id }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({ tasks: s.tasks, activeTaskId: s.activeTaskId }) as TaskStore,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Partial<TaskStore>;
        const tasks = Array.isArray(state.tasks) ? state.tasks : [];
        if (version < 2) {
          return {
            tasks: tasks.map((t) => ({
              ...t,
              // Preserve stored values when present; fill only missing.
              focusMode: (t as Task).focusMode === "infinite" ? "infinite" : "allocated",
              sessionName: (t as Task).sessionName ?? null,
              focusedMs:
                typeof (t as Task).focusedMs === "number"
                  ? (t as Task).focusedMs
                  : Math.max(0, Math.round(((t as Task).focusedMinutes ?? 0) * 60000)),
              breakMs: (t as Task).breakMs ?? 0,
              interruptions: (t as Task).interruptions ?? 0,
              completedFocusCount:
                (t as Task).completedFocusCount ?? (t as Task).completedPomodoros ?? 0,
              lastPhase: (t as Task).lastPhase ?? null,
            })),
            activeTaskId: state.activeTaskId ?? null,
          } as TaskStore;
        }
        return state as TaskStore;
      },
    }
  )
);

export function selectTaskById(tasks: Task[], id: string | null): Task | null {
  if (!id) return null;
  return tasks.find((t) => t.id === id) ?? null;
}
