"use client";

import { create } from "zustand";

interface SyncStatus {
  /** Last successful cloud sync (ms), null when never synced on this device. */
  lastSyncedAt: number | null;
  syncing: boolean;
  error: string | null;
  setSyncing: (v: boolean) => void;
  setResult: (ok: boolean, error?: string | null) => void;
}

export const useSyncStore = create<SyncStatus>()((set) => ({
  lastSyncedAt: null,
  syncing: false,
  error: null,
  setSyncing: (v) => set({ syncing: v }),
  setResult: (ok, error = null) =>
    set((s) => ({
      syncing: false,
      error: ok ? null : (error ?? "Sync failed."),
      lastSyncedAt: ok ? Date.now() : s.lastSyncedAt,
    })),
}));
