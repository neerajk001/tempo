import { describe, it, expect, beforeEach } from "vitest";
import {
  isGuestExpired,
  touchGuest,
  loadGuestMeta,
  GUEST_TTL_MS,
  type GuestMeta,
} from "@/lib/guest";

const DAY = 24 * 60 * 60 * 1000;

describe("isGuestExpired", () => {
  const meta: GuestMeta = { createdAt: 0, lastActiveAt: 1_000_000_000 };

  it("is false while inside the 7-day window", () => {
    expect(isGuestExpired(meta, meta.lastActiveAt + 6 * DAY)).toBe(false);
    expect(isGuestExpired(meta, meta.lastActiveAt + GUEST_TTL_MS - 1)).toBe(false);
  });

  it("does not expire exactly at the boundary", () => {
    expect(isGuestExpired(meta, meta.lastActiveAt + GUEST_TTL_MS)).toBe(false);
  });

  it("expires once the window lapses", () => {
    expect(isGuestExpired(meta, meta.lastActiveAt + GUEST_TTL_MS + 1)).toBe(true);
    expect(isGuestExpired(meta, meta.lastActiveAt + 8 * DAY)).toBe(true);
  });

  it("treats a missing marker as not expired", () => {
    expect(isGuestExpired(null, Date.now())).toBe(false);
  });
});

describe("guest meta persistence", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    };
  });

  it("creates a marker then refreshes lastActiveAt", () => {
    const first = touchGuest(1_000_000, true);
    expect(first).toEqual({ createdAt: 1_000_000, lastActiveAt: 1_000_000 });
    expect(loadGuestMeta()).toEqual(first);

    const later = touchGuest(1_000_000 + 60_000, true);
    expect(later?.createdAt).toBe(1_000_000);
    expect(later?.lastActiveAt).toBe(1_000_000 + 60_000);
    expect(loadGuestMeta()).toEqual(later);
  });

  it("throttles non-forced touches so refreshes don't spam storage", () => {
    touchGuest(5_000_000, true);
    touchGuest(5_000_000 + 1_000);
    expect(loadGuestMeta()?.lastActiveAt).toBe(5_000_000);

    touchGuest(5_000_000 + 30_001);
    expect(loadGuestMeta()?.lastActiveAt).toBe(5_000_000 + 30_001);
  });
});
