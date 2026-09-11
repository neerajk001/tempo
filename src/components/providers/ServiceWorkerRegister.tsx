"use client";

import { useEffect } from "react";

// Production-only: dev HMR + SW caching don't mix.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Optional enhancement — the app works fully without it.
    });
  }, []);
  return null;
}
