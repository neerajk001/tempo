"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import Sidebar from "@/components/layout/Sidebar";
import MiniTimer from "@/components/desktop/MiniTimer";
import { isMiniWindow } from "@/lib/desktop";
import { IS_DESKTOP } from "@/lib/platform";

/**
 * Renders the normal app shell, except inside the desktop mini-widget window
 * (flagged by a Rust initialization script), where it renders the compact
 * timer instead. On the web this is a pass-through with no added latency.
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  // Desktop starts undecided so the mini window never mounts the full shell
  // (and the server/client markup still match).
  const [mini, setMini] = useState<boolean | null>(IS_DESKTOP ? null : false);

  useEffect(() => {
    if (IS_DESKTOP) setMini(isMiniWindow());
  }, []);

  if (mini === null) return <div className="min-h-screen bg-surface" />;
  if (mini) return <MiniTimer />;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <div className="flex flex-col md:flex-row flex-1">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full mx-auto max-w-[1440px] min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
