"use client";

/**
 * Local-first data lives under `tempo-*` localStorage keys (zustand stores,
 * tombstones, guest meta, scratchpads). This is the single place that wipes it
 * — used by "Clear Local Index", guest expiry, and sign-out reset.
 */

export function clearLocalTempoData(): void {
  try {
    if (typeof window === "undefined") return;
    const ls = window.localStorage;
    Object.keys(ls)
      .filter((k) => k.startsWith("tempo-"))
      .forEach((k) => ls.removeItem(k));
  } catch {
    // Storage blocked/full — nothing else to do.
  }
}
