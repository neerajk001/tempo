"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PomodoroPhase, PomodoroStatus, SessionEventType } from "@/types";

export interface HistoryEvent {
  type: SessionEventType;
  at: number;
}

export interface SessionRecord {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  phase: PomodoroPhase;
  status: Extract<PomodoroStatus, "COMPLETED" | "CANCELLED">;
  plannedMs: number;
  startedAt: number;
  endedAt: number;
  focusedMs: number;
  pausedMs: number;
  interruptions: number;
  events: HistoryEvent[];
}

interface HistoryActions {
  logSession: (r: Omit<SessionRecord, "id"> & { id?: string }) => SessionRecord;
  removeSession: (id: string) => void;
  clearHistory: () => void;
}

interface HistoryStore extends HistoryActions {
  sessions: SessionRecord[];
}

const STORAGE_KEY = "tempo-sessions-v1";

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
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useSessionHistoryStore = create<HistoryStore>()(
  persist(
    (set) => ({
      sessions: [],

      logSession: (r) => {
        const record: SessionRecord = { ...r, id: r.id ?? uid() };
        set((s) => ({ sessions: [record, ...s.sessions].slice(0, 500) }));
        return record;
      },

      removeSession: (id) =>
        set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),

      clearHistory: () => set({ sessions: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({ sessions: s.sessions }) as HistoryStore,
    }
  )
);

export function sessionsOnDate(sessions: SessionRecord[], dateKey: string): SessionRecord[] {
  // dateKey YYYY-MM-DD in local timezone
  return sessions.filter((s) => {
    const d = new Date(s.startedAt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}` === dateKey;
  });
}
