"use client";

/**
 * Guest lifecycle metadata.
 *
 * When nobody is signed in, local data is retained for a sliding 7-day
 * inactivity window. `lastActiveAt` is refreshed while the app is used, so a
 * browser refresh or reopening within the window never deletes anything. Once
 * the window lapses the guest data is cleared (see GuestLifecycle).
 *
 * The marker is removed after data is safely synced to an account, so the TTL
 * never applies to authenticated users' local cache.
 */

import { clearLocalTempoData } from "@/lib/local-data";

const GUEST_KEY = "tempo-guest-v1";

export const GUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_THROTTLE_MS = 30_000;

export interface GuestMeta {
  createdAt: number;
  lastActiveAt: number;
}

export function loadGuestMeta(): GuestMeta | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestMeta>;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : null;
    const lastActiveAt = typeof parsed.lastActiveAt === "number" ? parsed.lastActiveAt : null;
    if (createdAt === null || lastActiveAt === null) return null;
    return { createdAt, lastActiveAt };
  } catch {
    return null;
  }
}

function saveGuestMeta(meta: GuestMeta): void {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(meta));
  } catch {
    // Ignore.
  }
}

export function clearGuestMeta(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(GUEST_KEY);
  } catch {
    // Ignore.
  }
}

/** Pure: has the guest's sliding inactivity window lapsed? */
export function isGuestExpired(
  meta: GuestMeta | null,
  now: number,
  ttl = GUEST_TTL_MS
): boolean {
  if (!meta) return false;
  return now - meta.lastActiveAt > ttl;
}

let lastTouchAt = 0;

/**
 * Record guest activity. Throttled so refresh/reopen/repeated events don't
 * hammer storage; pass `force` to always write (used on first load).
 */
export function touchGuest(now = Date.now(), force = false): GuestMeta | null {
  if (typeof window === "undefined") return null;
  if (!force && now - lastTouchAt < TOUCH_THROTTLE_MS) return loadGuestMeta();
  lastTouchAt = now;
  const existing = loadGuestMeta();
  const meta: GuestMeta = existing
    ? { ...existing, lastActiveAt: now }
    : { createdAt: now, lastActiveAt: now };
  saveGuestMeta(meta);
  return meta;
}

/** Remove all expired guest data and restart as a fresh guest. */
export function purgeGuestData(): void {
  clearLocalTempoData();
  if (typeof window !== "undefined") window.location.reload();
}
