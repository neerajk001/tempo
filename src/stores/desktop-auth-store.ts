"use client";

import { create } from "zustand";
import { EVT_AUTH, invokeCommand, isTauri, listenEvent } from "@/lib/desktop";
import { API_BASE, apiUrl } from "@/lib/api-base";

export interface DesktopUser {
  name?: string | null;
  email?: string | null;
}

interface AuthRecord {
  token: string;
  user: DesktopUser;
  expiresAt: number;
}

type Status = "loading" | "authenticated" | "unauthenticated";

interface DesktopAuthState {
  status: Status;
  token: string | null;
  user: DesktopUser | null;
  error: string | null;
  init: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Called when the server rejects the token (expired/revoked). */
  expire: () => void;
}

function randomBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function waitForRedirect(state: string): Promise<{ token?: string; error?: string }> {
  return new Promise((resolve) => {
    let unlisten: (() => void) | undefined;
    let settled = false;
    const finish = (result: { token?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unlisten?.();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ error: "Sign-in timed out. Try again." }),
      5 * 60 * 1000
    );
    void listenEvent<{ state?: string; token?: string; error?: string }>(EVT_AUTH, (payload) => {
      if (payload.state && payload.state !== state) return;
      finish({ token: payload.token, error: payload.error });
    }).then((off) => {
      unlisten = off;
      if (settled) off();
    });
  });
}

/**
 * Account state for the desktop app. The web keeps using NextAuth; this store
 * is only populated when running inside Tauri, where the sync token lives in
 * the app data directory (managed by the Rust shell).
 */
export const useDesktopAuthStore = create<DesktopAuthState>()((set, get) => ({
  status: "loading",
  token: null,
  user: null,
  error: null,

  init: async () => {
    if (!isTauri()) {
      set({ status: "unauthenticated" });
      return;
    }
    try {
      const record = await invokeCommand<AuthRecord | null>("desktop_auth_load");
      if (record?.token && record.expiresAt > Date.now()) {
        set({ status: "authenticated", token: record.token, user: record.user, error: null });
        return;
      }
      if (record) await invokeCommand("desktop_auth_clear");
      set({ status: "unauthenticated", token: null, user: null });
    } catch {
      set({ status: "unauthenticated", token: null, user: null });
    }
  },

  signIn: async () => {
    if (!isTauri() || get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const verifier = randomBase64Url(64);
      const challenge = await sha256Base64Url(verifier);
      const state = randomBase64Url(24);

      const started = await invokeCommand<{ port: number; url: string }>("start_desktop_auth", {
        state,
        apiBase: API_BASE,
        codeChallenge: challenge,
      });
      if (!started) throw new Error("Could not open the sign-in window.");

      const redirect = await waitForRedirect(state);
      if (!redirect.token) throw new Error(redirect.error || "Sign-in was cancelled.");

      const res = await fetch(apiUrl("/api/desktop/auth/exchange"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: redirect.token, verifier }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error || "Could not complete sign-in.");
      }
      const record = (await res.json()) as AuthRecord;
      if (!record?.token) throw new Error("No sync token returned.");

      await invokeCommand("desktop_auth_save", { record });
      set({ status: "authenticated", token: record.token, user: record.user, error: null });
    } catch (e) {
      set({
        status: "unauthenticated",
        token: null,
        user: null,
        error: e instanceof Error ? e.message : "Sign-in failed.",
      });
    }
  },

  signOut: async () => {
    await invokeCommand("desktop_auth_clear");
    set({ status: "unauthenticated", token: null, user: null, error: null });
  },

  expire: () => {
    void invokeCommand("desktop_auth_clear");
    set({
      status: "unauthenticated",
      token: null,
      user: null,
      error: "Session expired — sign in again.",
    });
  },
}));
