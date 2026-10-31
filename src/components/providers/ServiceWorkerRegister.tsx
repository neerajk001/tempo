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
      // Once per session: unregister (or clear caches from) any stale worker,
      // then reload even if the Rust sweep already removed the registration.
      if (sessionStorage.getItem("tempo-sw-repaired") === "1") return;
      void (async () => {
        let dirty = false;
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          dirty = regs.length > 0;
          await Promise.all(regs.map((reg) => reg.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          dirty = dirty || keys.length > 0;
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
        if (dirty) {
          sessionStorage.setItem("tempo-sw-repaired", "1");
          location.reload();
        }
      })().catch(() => {});
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Optional enhancement — the app works fully without it.
    });
  }, []);
  return null;
}
