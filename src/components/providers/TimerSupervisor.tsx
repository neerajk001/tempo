"use client";

import { useEffect } from "react";
import { useNow } from "@/hooks/useNow";
import { useFinishSession } from "@/hooks/useFinishSession";
import { isExpired } from "@/lib/pomodoro-machine";
import { usePomodoroStore } from "@/stores/pomodoro-store";

/**
 * Single global completion driver for the main window.
 *
 * Expiry used to live in three page components, so a session that ended on any
 * other route (tasks, settings, history, plan, review, library) stayed RUNNING
 * and completed late — crediting the whole gap as focus. This runs from the app
 * shell instead and is the only place that finalizes an expired session.
 *
 * Mounted only for the main shell (never the mini widget) so completion,
 * History, chime/notification and auto-advance fire exactly once.
 */
export default function TimerSupervisor() {
  const session = usePomodoroStore((s) => s.session);
  const running = session.status === "RUNNING";
  const now = useNow(running);
  const { handleComplete } = useFinishSession();

  useEffect(() => {
    if (running && isExpired(session, Date.now())) handleComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, now]);

  return null;
}
