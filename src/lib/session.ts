"use client";

import { useSession as useNextAuthSession } from "next-auth/react";
import { IS_DESKTOP } from "@/lib/platform";
import { useDesktopAuthStore } from "@/stores/desktop-auth-store";

export interface AppSession {
  data: {
    user?: { name?: string | null; email?: string | null; image?: string | null };
  } | null;
  status: "loading" | "authenticated" | "unauthenticated";
  update: (...args: unknown[]) => Promise<unknown>;
}

/** Desktop has its own token-based account state (see desktop-auth-store). */
function useDesktopSession(): AppSession {
  const status = useDesktopAuthStore((s) => s.status);
  const user = useDesktopAuthStore((s) => s.user);
  return {
    data: user ? { user: { name: user.name, email: user.email, image: null } } : null,
    status,
    update: async () => null,
  };
}

/**
 * Single entry point for session state. On the web this delegates to NextAuth;
 * in the local desktop build it reflects the Google account linked through the
 * loopback sign-in flow, and stays unauthenticated when no account is linked.
 */
export const useSession: () => AppSession = IS_DESKTOP
  ? useDesktopSession
  : (useNextAuthSession as unknown as () => AppSession);
