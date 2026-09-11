"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { initSync, setSyncAuthed, maybeAutoSync } from "@/lib/sync";

/**
 * Background cloud sync driver. Local-first UI is untouched — this only
 * converges local stores with the server when signed in and online:
 * full sync on sign-in, then throttled syncs on tab focus + interval.
 */
export default function SyncManager() {
  const { status } = useSession();

  useEffect(() => {
    initSync();
  }, []);

  useEffect(() => {
    setSyncAuthed(status === "authenticated");
    if (status === "authenticated") void maybeAutoSync();
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
