"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CollisionMode = "auto" | "flag";
export type ChimeTheme = "chime" | "marimba" | "bell" | "muted";
export type TimerStyle = "circular" | "flip" | "analog";

export interface TimerPos {
  x: number;
  y: number;
}

interface PrefsState {
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  notifyFocus: boolean;
  notifyBreak: boolean;
  reviewPrompt: boolean;
  chimeTheme: ChimeTheme;
  compact: boolean;
  collisionMode: CollisionMode;
  timerStyle: TimerStyle;
  /** Floating-timer prefs (immersive Focus Mode). Null pos = centered. */
  timerScale: number;
  timerPos: TimerPos | null;
  timerHidden: boolean;
  set: (patch: Partial<PrefsState>) => void;
  resetPrefs: () => void;
}

const DEFAULTS = {
  autoStartBreaks: true,
  autoStartFocus: false,
  notifyFocus: false,
  notifyBreak: false,
  reviewPrompt: false,
  chimeTheme: "chime" as ChimeTheme,
  compact: false,
  collisionMode: "auto" as CollisionMode,
  timerStyle: "circular" as TimerStyle,
  timerScale: 1,
  timerPos: null,
  timerHidden: false,
};

const STORAGE_KEY = "tempo-prefs-v1";

const ssrSafeStorage = () => {
  if (typeof window !== "undefined") return localStorage;
  return {
    getItem: (_k: string) => null,
    setItem: (_k: string, _v: string) => {},
    removeItem: (_k: string) => {},
  };
};

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      resetPrefs: () => set({ ...DEFAULTS }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({
        autoStartBreaks: s.autoStartBreaks,
        autoStartFocus: s.autoStartFocus,
        notifyFocus: s.notifyFocus,
        notifyBreak: s.notifyBreak,
        reviewPrompt: s.reviewPrompt,
        chimeTheme: s.chimeTheme,
        compact: s.compact,
        collisionMode: s.collisionMode,
        timerStyle: s.timerStyle,
        timerScale: s.timerScale,
        timerPos: s.timerPos,
        timerHidden: s.timerHidden,
      }) as PrefsState,
    }
  )
);
