"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ChimeTheme = "chime" | "marimba" | "bell" | "muted";
export type TimerStyle = "circular" | "flip" | "analog";

interface PrefsState {
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  notifyFocus: boolean;
  notifyBreak: boolean;
  reviewPrompt: boolean;
  chimeTheme: ChimeTheme;
  compact: boolean;
  timerStyle: TimerStyle;
  /** Fade the focus timer so the ambient video shows through. */
  timerFaded: boolean;
  /** Hide the focus timer entirely (recoverable via the Show pill). */
  timerHidden: boolean;
  set: (patch: Partial<PrefsState>) => void;
  resetPrefs: () => void;
}

const DEFAULTS = {
  autoStartBreaks: false,
  autoStartFocus: false,
  notifyFocus: false,
  notifyBreak: false,
  reviewPrompt: false,
  chimeTheme: "chime" as ChimeTheme,
  compact: false,
  timerStyle: "circular" as TimerStyle,
  timerFaded: false,
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
      version: 2,
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (s) => ({
        autoStartBreaks: s.autoStartBreaks,
        autoStartFocus: s.autoStartFocus,
        notifyFocus: s.notifyFocus,
        notifyBreak: s.notifyBreak,
        reviewPrompt: s.reviewPrompt,
        chimeTheme: s.chimeTheme,
        compact: s.compact,
        timerStyle: s.timerStyle,
        timerFaded: s.timerFaded,
        timerHidden: s.timerHidden,
      }) as PrefsState,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Partial<PrefsState>;
        // Breaks are started manually now. Earlier builds shipped with
        // auto-start-breaks on by default, so reset it once for existing installs.
        if (version < 2) {
          try {
            // Stamp the settings bundle so this local change wins the
            // cross-device merge and a stale remote copy cannot turn it back on.
            window.localStorage.setItem(
              "tempo-settings-meta-v1",
              JSON.stringify({ updatedAt: Date.now() })
            );
          } catch {
            // Ignore.
          }
          return { ...state, autoStartBreaks: false } as PrefsState;
        }
        return state as PrefsState;
      },
    }
  )
);
