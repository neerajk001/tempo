"use client";

import { useEffect } from "react";
import { isTauri } from "@/lib/desktop";

// Production-only: dev HMR + SW caching don't mix.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    // The desktop shell serves bundled assets. Earlier builds registered a
    // worker on this origin, which would keep serving pre-upgrade assets, so
    // drop any registration and its caches instead of adding a new one.
    if (isTauri()) {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) void reg.unregister();
        });
      }
      if ("caches" in window) {
        void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      }
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Optional enhancement — the app works fully without it.
    });
  }, []);
  return null;
}
