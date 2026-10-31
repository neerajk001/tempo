"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { IS_DESKTOP } from "@/lib/platform";
import { useDesktopAuthStore } from "@/stores/desktop-auth-store";

function DesktopAuthProvider({ children }: { children: React.ReactNode }) {
  // Hydrate the saved sync token once at startup.
  useEffect(() => {
    void useDesktopAuthStore.getState().init();
  }, []);
  return <>{children}</>;
}

export default function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  // The desktop build uses its own token store instead of NextAuth.
  if (IS_DESKTOP) return <DesktopAuthProvider>{children}</DesktopAuthProvider>;
  return <SessionProvider>{children}</SessionProvider>;
}
