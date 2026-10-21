"use client";

import { SessionProvider } from "next-auth/react";
import { IS_DESKTOP } from "@/lib/platform";

export default function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  // The desktop build is local-only: no NextAuth context (and no session fetch).
  if (IS_DESKTOP) return <>{children}</>;
  return <SessionProvider>{children}</SessionProvider>;
}
