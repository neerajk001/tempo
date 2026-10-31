"use client";

import { useEffect } from "react";
import {
  EVT_COMMAND,
  EVT_IDLE,
  EVT_REQUEST_STATE,
  EVT_STATE,
  emitEvent,
  invokeCommand,
  isMiniWindow,
  isTauri,
  listenEvent,
} from "@/lib/desktop";
import type { DesktopCommand, DesktopStatePayload } from "@/lib/desktop";
import { getElapsedFocusMs, getRemainingMs } from "@/lib/pomodoro-machine";
import { getBreakPhaseAfterFocus } from "@/lib/pomodoro-config";
import { resolveBreaks, usePomodoroStore } from "@/stores/pomodoro-store";
import { usePrefsStore } from "@/stores/prefs-store";

/** Break duration due after the just-finished focus block (null unless break-ready). */
function readyBreakMs(): number | undefined {
  const s = usePomodoroStore.getState();
  if (s.session.status !== "COMPLETED" || s.session.phase !== "FOCUS" || s.session.isInfinite) {
    return undefined;
  }
  const breaks = resolveBreaks(s.config, s.breakOverride);
  const due = getBreakPhaseAfterFocus(s.session.completedFocusCount, { ...s.config, ...breaks });
  return due === "LONG_BREAK" ? breaks.longBreakMs : breaks.shortBreakMs;
}

function snapshot(): DesktopStatePayload {
  const s = usePomodoroStore.getState();
  return {
    session: s.session,
    activeTaskTitle: s.activeTaskTitle,
    focusMode: s.focusMode,
    sessionName: s.sessionName,
    quickLabel: s.quickLabel,
    readyBreakMs: readyBreakMs(),
  };
}

function tooltipText(): string {
  const s = usePomodoroStore.getState();
  const status = s.session.status;
  if (status !== "RUNNING" && status !== "PAUSED") return "Tempo";
  const now = Date.now();
  const phase = s.session.phase === "FOCUS" ? "Focus" : "Break";
  if (s.session.isInfinite) {
    const mins = Math.floor(getElapsedFocusMs(s.session, now) / 60000);
    return `${phase} · ${mins}m elapsed`;
  }
  const remaining = getRemainingMs(s.session, now);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${phase} · ${mins}:${String(secs).padStart(2, "0")} left${status === "PAUSED" ? " (paused)" : ""}`;
}

/**
 * Main-window side of the desktop bridge:
 * - broadcasts the live session to the mini widget on every change,
 * - applies commands coming from the tray / mini widget,
 * - keeps the tray tooltip in sync once per second while a session runs.
 *
 * Mounted in the root layout; a no-op on the web and inside the mini window.
 */
export default function DesktopBridge() {
  useEffect(() => {
    if (!isTauri() || isMiniWindow()) return;

    const broadcast = () => void emitEvent(EVT_STATE, snapshot());
    broadcast();
    const unsubscribe = usePomodoroStore.subscribe(broadcast);

    let unlistenCommand: (() => void) | undefined;
    void listenEvent<DesktopCommand>(EVT_COMMAND, ({ action }) => {
      const store = usePomodoroStore.getState();
      if (action === "pause") store.pause();
      else if (action === "resume") store.resume();
      else if (action === "toggle") {
        if (store.session.status === "RUNNING") store.pause();
        else if (store.session.status === "PAUSED") store.resume();
      } else if (action === "skip") {
        // Never cancel a live focus from the tray: that would log it as
        // CANCELLED and drop task credit. Only start a break from idle/terminal.
        if (store.session.status === "IDLE" || store.session.status === "COMPLETED") {
          store.startBreak();
        }
      }
    }).then((u) => {
      unlistenCommand = u;
    });

    let unlistenRequest: (() => void) | undefined;
    void listenEvent(EVT_REQUEST_STATE, () => broadcast()).then((u) => {
      unlistenRequest = u;
    });

    // Auto-pause a running focus block after the user has been idle.
    let unlistenIdle: (() => void) | undefined;
    void listenEvent<{ idleSeconds: number }>(EVT_IDLE, ({ idleSeconds }) => {
      const prefs = usePrefsStore.getState();
      const store = usePomodoroStore.getState();
      if (!prefs.autoPauseIdle) return;
      if (store.session.status !== "RUNNING") return;
      if (idleSeconds >= prefs.idlePauseSeconds) store.pause();
    }).then((u) => {
      unlistenIdle = u;
    });

    // Website blocking: applied for a running FOCUS block, cleared otherwise.
    // Operations are serialized and re-evaluated after each await so a pause
    // during a UAC prompt still clears the block, and domain edits re-apply.
    let blockBusy = false;
    let blockApplied = false;
    let appliedKey = "";
    const wantBlock = () => {
      const prefs = usePrefsStore.getState();
      const store = usePomodoroStore.getState();
      return {
        want:
          prefs.blockEnabled &&
          prefs.blockDomains.length > 0 &&
          store.session.status === "RUNNING" &&
          store.session.phase === "FOCUS",
        domains: prefs.blockDomains,
        key: prefs.blockDomains.slice().sort().join("|"),
      };
    };
    const reconcileBlock = async () => {
      if (blockBusy) return;
      blockBusy = true;
      try {
        for (let i = 0; i < 4; i++) {
          const { want, domains, key } = wantBlock();
          if (want && !blockApplied) {
            await invokeCommand("apply_block", { domains });
            blockApplied = true;
            appliedKey = key;
          } else if (want && appliedKey !== key) {
            await invokeCommand("apply_block", { domains });
            appliedKey = key;
          } else if (!want && blockApplied) {
            await invokeCommand("clear_block");
            blockApplied = false;
            appliedKey = "";
          } else {
            break;
          }
        }
      } catch {
        // Leave the state for the next session/prefs change to retry.
      } finally {
        blockBusy = false;
      }
    };
    const syncBlock = () => void reconcileBlock();
    const unsubscribeBlock = usePomodoroStore.subscribe(syncBlock);
    const unsubscribePrefs = usePrefsStore.subscribe(syncBlock);
    syncBlock();

    // Only do periodic IPC while a session is live. Store subscriptions handle
    // one-off changes, so idle periods cost nothing.
    let lastActive = false;
    const ticker = setInterval(() => {
      const s = usePomodoroStore.getState();
      const status = s.session.status;
      const active = status === "RUNNING" || status === "PAUSED";
      if (!active && !lastActive) return;
      lastActive = active;

      // Re-broadcast each second so the mini widget recovers instantly from a
      // missed event (e.g. while it was hidden) instead of showing stale state.
      broadcast();
      void invokeCommand("set_tray_tooltip", { text: tooltipText() });

      // Windows taskbar progress for the live block.
      if (active && !s.session.isInfinite && s.session.plannedMs > 0) {
        const elapsed = getElapsedFocusMs(s.session, Date.now());
        const progress = Math.min(1, Math.max(0, elapsed / s.session.plannedMs));
        void invokeCommand("set_taskbar_progress", { progress, paused: status === "PAUSED" });
      } else {
        void invokeCommand("set_taskbar_progress", { progress: -1, paused: false });
      }
    }, 1000);

    return () => {
      unsubscribe();
      unlistenCommand?.();
      unlistenRequest?.();
      unlistenIdle?.();
      unsubscribeBlock();
      unsubscribePrefs();
      clearInterval(ticker);
    };
  }, []);

  return null;
}
