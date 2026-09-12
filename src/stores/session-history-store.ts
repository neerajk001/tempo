"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FocusMode, PomodoroPhase, PomodoroStatus, SessionEventType } from "@/types";
import { addSessionTombstone, addSessionTombstones } from "@/lib/tombstones";

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
  /**
   * Which scheduling mode produced this record. Absent on legacy records —
   * treat as "allocated". Infinite + Allocated share the same table so the
   * Dashboard can sum total focus consistently.
   */
  sessionMode?: FocusMode;
  /** User-provided Infinite session label (falls back to taskTitle). */
  sessionName?: string | null;
  /** Break time tracked separately from focused time (infinite pause-breaks). */
  breakMs?: number;
}

/** Resolve a record's mode with legacy fallback. */
export function getSessionMode(r: Pick<SessionRecord, "sessionMode"> | null | undefined): FocusMode {
  return r?.sessionMode === "infinite" ? "infinite" : "allocated";
}

/** Display label for a record (infinite session name wins). */
export function getRecordLabel(r: Pick<SessionRecord, "sessionName" | "taskTitle"> | null | undefined, fallback = "Focus Session"): string {
  if (!r) return fallback;
  const named = (r.sessionName ?? "").trim();
  if (named) return named;
  return r.taskTitle ?? fallback;
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
    (set, get) => ({
      sessions: [],

      logSession: (r) => {
        const record: SessionRecord = {
          sessionMode: "allocated",
          sessionName: null,
          breakMs: 0,
          ...r,
          id: r.id ?? uid(),
        };
        set((s) => ({ sessions: [record, ...s.sessions].slice(0, 500) }));
        return record;
      },

      removeSession: (id) => {
        // Remember the delete for cloud sync so other devices drop it too.
        addSessionTombstone(id);
        set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
      },

      clearHistory: () => {
        addSessionTombstones(get().sessions.map((x) => x.id));
        set({ sessions: [] });
      },
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
