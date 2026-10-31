"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/hooks/useNow";
import {
  EVT_COMMAND,
  EVT_REQUEST_STATE,
  EVT_STATE,
  emitEvent,
  hideMiniWindow,
  invokeCommand,
  listenEvent,
} from "@/lib/desktop";
import type { DesktopStatePayload } from "@/lib/desktop";
import { getElapsedFocusMs, getRemainingMs } from "@/lib/pomodoro-machine";
import { getBreakPhaseAfterFocus } from "@/lib/pomodoro-config";
import { resolveBreaks, usePomodoroStore } from "@/stores/pomodoro-store";

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function initialPayload(): DesktopStatePayload {
  const s = usePomodoroStore.getState();
  let readyBreakMs: number | undefined;
  if (s.session.status === "COMPLETED" && s.session.phase === "FOCUS" && !s.session.isInfinite) {
    const breaks = resolveBreaks(s.config, s.breakOverride);
    const due = getBreakPhaseAfterFocus(s.session.completedFocusCount, { ...s.config, ...breaks });
    readyBreakMs = due === "LONG_BREAK" ? breaks.longBreakMs : breaks.shortBreakMs;
  }
  return {
    session: s.session,
    activeTaskTitle: s.activeTaskTitle,
    focusMode: s.focusMode,
    sessionName: s.sessionName,
    quickLabel: s.quickLabel,
    readyBreakMs,
  };
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Compact always-on-top timer widget. It renders its own clock from the
 * timestamp-based session state, so it stays accurate even when the main
 * window is hidden. The window itself is created and toggled from Rust.
 */
export default function MiniTimer() {
  const [state, setState] = useState<DesktopStatePayload>(initialPayload);

  useEffect(() => {
    // Frameless + transparent window: drop the page's opaque canvas.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.backgroundImage = "none";
    document.body.style.overflow = "hidden";

    let unlisten: (() => void) | undefined;
    void listenEvent<DesktopStatePayload>(EVT_STATE, setState).then((u) => {
      unlisten = u;
    });
    void emitEvent(EVT_REQUEST_STATE);

    // The widget can be hidden for a while; events emitted meanwhile may not be
    // applied. On show/focus, pull the shared persisted state and ask the main
    // window for a fresh snapshot so a break never shows up as a stale focus.
    const refresh = () => {
      const result = usePomodoroStore.persist.rehydrate();
      if (result && typeof result.then === "function") {
        void result.then(() => setState(initialPayload())).catch(() => {});
      } else {
        setState(initialPayload());
      }
      void emitEvent(EVT_REQUEST_STATE);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);

    return () => {
      unlisten?.();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const session = state.session;
  const paused = session.status === "PAUSED";
  const active = session.status === "RUNNING" || paused;
  const idle = !active;
  const infinite = session.isInfinite === true;
  const isBreak = session.phase !== "FOCUS";
  // Focus finished, break not started yet: show the due break length.
  const breakReady = !infinite && session.status === "COMPLETED" && session.phase === "FOCUS";
  const accent = isBreak || breakReady ? "#e09145" : "#7fb069";

  const now = useNow(session.status === "RUNNING");
  const elapsed = getElapsedFocusMs(session, now);
  const remaining = getRemainingMs(session, now);

  const primary = breakReady
    ? format(state.readyBreakMs ?? 0)
    : idle
      ? "--:--"
      : infinite
        ? format(elapsed)
        : format(remaining);
  const label = breakReady
    ? "Break"
    : state.sessionName || state.quickLabel || state.activeTaskTitle || (isBreak ? "Break" : "Focus");
  const sub = breakReady
    ? "Break ready"
    : idle
      ? "No active session"
      : infinite
        ? "Infinite · elapsed"
        : paused
          ? "Paused"
          : isBreak
            ? "Break remaining"
            : "Focus remaining";

  return (
    <div
      data-tauri-drag-region
      className="h-screen w-screen flex items-center gap-2.5 pl-3.5 pr-1.5 select-none"
      style={{
        background: "#1c1b18",
        border: "1px solid #3e3c38",
        borderRadius: 12,
        color: "#f2ede3",
        overflow: "hidden",
      }}
    >
      <span
        data-tauri-drag-region
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: idle && !breakReady ? "#6b7280" : accent,
          boxShadow: active && !paused ? `0 0 8px ${accent}` : "none",
        }}
      />
      <div data-tauri-drag-region className="flex flex-col min-w-0 flex-1">
        <span
          className="font-mono font-medium leading-none tracking-tight"
          style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}
        >
          {primary}
        </span>
        <span
          data-tauri-drag-region
          className="truncate text-[9px] uppercase tracking-wider mt-0.5"
          style={{ color: "#a8a29a" }}
        >
          {label} · {sub}
        </span>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {!idle && (
          <button
            type="button"
            onClick={() => void emitEvent(EVT_COMMAND, { action: "toggle" })}
            title={paused ? "Resume" : "Pause"}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        )}
        <button
          type="button"
          onClick={() => void invokeCommand("show_main_window")}
          title="Open Tempo"
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <ExpandIcon />
        </button>
        <button
          type="button"
          onClick={() => void hideMiniWindow()}
          title="Hide"
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
