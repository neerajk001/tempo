"use client";

import { useSession as useNextAuthSession } from "next-auth/react";
import { IS_DESKTOP } from "@/lib/platform";

export interface AppSession {
  data: {
    user?: { name?: string | null; email?: string | null; image?: string | null };
  } | null;
  status: "loading" | "authenticated" | "unauthenticated";
  update: (...args: unknown[]) => Promise<unknown>;
}

/** Desktop has no accounts — always a local, unauthenticated session. */
function useLocalSession(): AppSession {
  return { data: null, status: "unauthenticated", update: async () => null };
}

/**
 * Single entry point for session state. On the web this delegates to NextAuth;
 * in the local desktop build it resolves to a fixed local session so no server
 * or `/api/auth/*` endpoint is ever required.
 */
export const useSession: () => AppSession = IS_DESKTOP
  ? useLocalSession
  : (useNextAuthSession as unknown as () => AppSession);
