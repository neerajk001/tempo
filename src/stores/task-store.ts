"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TaskPriority, TaskStatus } from "@/types";
import { todayKey } from "@/lib/task-planning";
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
}

export interface NewTaskInput {
  title: string;
  description?: string;
  date?: string;
  allocatedMinutes: number;
  focusMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
  longBreakInterval?: number;
  project?: string;
  priority?: TaskPriority;
  calendarEventId?: string;
  startMs?: number;
  endMs?: number;
}

export type TaskPatch = Partial<
  Pick<Task, "title" | "description" | "date" | "allocatedMinutes" | "focusMinutes" | "project" | "priority" | "startMs" | "endMs" | "shortBreakMinutes" | "longBreakMinutes" | "longBreakInterval">
>;

interface TaskActions {
  createTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: TaskPatch) => void;
  setStatus: (id: string, status: TaskStatus) => void;
  removeTask: (id: string) => void;
  addSubtask: (taskId: string, title: string) => Subtask;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  removeSubtask: (taskId: string, subtaskId: string) => void;
  recordFocus: (id: string, minutes: number) => void;
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

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      activeTaskId: null,

      createTask: (input) => {
        const now = Date.now();
        const task: Task = {
          id: uid(),
          title: normalizeTitle(input.title),
          description: (input.description ?? "").trim().slice(0, 2000),
          date: input.date ?? todayKey(),
          allocatedMinutes: normalizeMinutes(input.allocatedMinutes, "Allocated time", 1, 1440),
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
            if (patch.allocatedMinutes !== undefined)
              next.allocatedMinutes = normalizeMinutes(
                patch.allocatedMinutes,
                "Allocated time",
                1,
                1440
              );
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
            const completedPomodoros = Math.floor(focusedMinutes / t.focusMinutes);
            const status: TaskStatus =
              t.status === "TODO" ? "IN_PROGRESS" : t.status;
            return { ...t, focusedMinutes, completedPomodoros, status, updatedAt: Date.now() };
          }),
        }));
        void get;
      },

      setActiveTask: (id) => set({ activeTaskId: id }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({ tasks: s.tasks, activeTaskId: s.activeTaskId }) as TaskStore,
    }
  )
);

export function selectTaskById(tasks: Task[], id: string | null): Task | null {
  if (!id) return null;
  return tasks.find((t) => t.id === id) ?? null;
}
