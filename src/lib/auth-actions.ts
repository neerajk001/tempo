"use client";

import { signIn, signOut } from "next-auth/react";
import { clearLocalTempoData } from "@/lib/local-data";
import { IS_DESKTOP } from "@/lib/platform";
import { useDesktopAuthStore } from "@/stores/desktop-auth-store";

/** Keep post-login redirects on this origin (never an open redirect). */
function safeCallback(callbackUrl?: string): string {
  if (!callbackUrl) return "/";
  try {
    const url = new URL(callbackUrl, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}

export function signInWithGoogle(callbackUrl?: string): void {
  if (IS_DESKTOP) {
    // Opens the system browser; the loopback listener completes the flow.
    void useDesktopAuthStore.getState().signIn();
    return;
  }
  void signIn("google", { callbackUrl: safeCallback(callbackUrl) });
}

/**
 * Sign out. On the web this also clears this device's local cache because the
 * account's records live in the database. On the desktop the local data is the
 * primary copy, so only the sync token is removed.
 */
export function signOutAndReset(): void {
  if (IS_DESKTOP) {
    void useDesktopAuthStore.getState().signOut();
    return;
  }
  clearLocalTempoData();
  void signOut({ callbackUrl: "/" });
}
