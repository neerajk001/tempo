"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { loadGuestMeta, isGuestExpired, touchGuest, purgeGuestData } from "@/lib/guest";

/**
 * Guest data retention driver.
 *
 * Guests keep local data for a sliding 7-day inactivity window. This component
 * refreshes the activity timestamp while the app is open and purges the data
 * once the window lapses. It deliberately does nothing while signed in, so an
 * authenticated user's local cache is never subject to the TTL.
 */
export default function GuestLifecycle() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    const meta = loadGuestMeta();
    if (meta && isGuestExpired(meta, Date.now())) {
      purgeGuestData();
      return;
    }
    touchGuest(Date.now(), true);
  }, [status]);

  useEffect(() => {
    if (status !== "unauthenticated") return;
    const touch = () => touchGuest();
    const onVisibility = () => {
      if (document.visibilityState === "visible") touch();
    };
    const timer = window.setInterval(touch, 60_000);
    window.addEventListener("focus", touch);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", touch);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status]);

  return null;
}
