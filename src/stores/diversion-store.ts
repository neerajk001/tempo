"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface Diversion {
  id: string;
  title: string;
  minutes: number;
  at: number;
}

interface DiversionActions {
  addDiversion: (title: string, minutes: number) => Diversion;
  removeDiversion: (id: string) => void;
}

interface DiversionStore extends DiversionActions {
  diversions: Diversion[];
}

const STORAGE_KEY = "tempo-diversions-v1";

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
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useDiversionStore = create<DiversionStore>()(
  persist(
    (set) => ({
      diversions: [],

      addDiversion: (title, minutes) => {
        const t = title.trim().slice(0, 120);
        if (!t) throw new Error("Diversion title is required");
        const m = Math.round(minutes);
        if (!Number.isFinite(m) || m < 1 || m > 480) throw new Error("Minutes must be 1..480");
        const entry: Diversion = { id: uid(), title: t, minutes: m, at: Date.now() };
        set((s) => ({ diversions: [entry, ...s.diversions].slice(0, 200) }));
        return entry;
      },

      removeDiversion: (id) => set((s) => ({ diversions: s.diversions.filter((d) => d.id !== id) })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({ diversions: s.diversions }) as DiversionStore,
    }
  )
);
