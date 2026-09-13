"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { initSync, setSyncAuthed, maybeAutoSync, migrateGuestToAccount } from "@/lib/sync";

/**
 * Background cloud sync driver. Local-first UI is untouched — this only
 * converges local stores with the server when signed in and online:
 * a full push+merge (migrating any guest data) on sign-in, then throttled
 * syncs on tab focus + interval.
 */
export default function SyncManager() {
  const { status } = useSession();

  useEffect(() => {
    initSync();
  }, []);

  useEffect(() => {
    setSyncAuthed(status === "authenticated");
    // Signing in merges whatever local (incl. guest) data exists into the account.
    if (status === "authenticated") void migrateGuestToAccount();
  }, [status]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => void maybeAutoSync();
    const onOnline = () => void maybeAutoSync();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void maybeAutoSync();
    }, 90000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return null;
}
