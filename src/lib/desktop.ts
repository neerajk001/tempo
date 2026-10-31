"use client";

import type { PomodoroState } from "@/lib/pomodoro-machine";

/**
 * Thin bridge between the web app and the Tauri shell.
 *
 * Every helper is a no-op outside Tauri, and the `@tauri-apps/api` modules are
 * imported dynamically so the normal web bundle never loads them. Detection is
 * done manually (`__TAURI_INTERNALS__`) to avoid a static import.
 */

export const EVT_STATE = "tempo://state";
export const EVT_COMMAND = "tempo://command";
export const EVT_REQUEST_STATE = "tempo://request-state";
export const EVT_IDLE = "tempo://idle";
/** Result of the loopback sign-in redirect, emitted by the Rust listener. */
export const EVT_AUTH = "tempo://auth-result";

export type DesktopCommand =
  | { action: "toggle" }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "skip" };

/** Live session snapshot broadcast from the main window to the mini widget. */
export interface DesktopStatePayload {
  session: PomodoroState;
  activeTaskTitle: string | null;
  focusMode: "allocated" | "infinite";
  sessionName: string | null;
  quickLabel: string | null;
  /**
   * Duration of the break that is due after a just-completed focus block.
   * Present only in the "break ready" state (focus finished, break not yet
   * started) so the mini widget can show it instead of idling at "--:--".
   */
  readyBreakMs?: number;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True inside the small always-on-top widget window (set by a Rust init script). */
export function isMiniWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __TEMPO_MINI__?: boolean }).__TEMPO_MINI__ === true
  );
}

export async function emitEvent(name: string, payload?: unknown): Promise<void> {
  if (!isTauri()) return;
  const { emit } = await import("@tauri-apps/api/event");
  await emit(name, payload);
}

export async function listenEvent<T>(
  name: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(name, (event) => handler(event.payload));
}

export async function invokeCommand<T = void>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Hide the mini widget. The Rust side also unchecks the tray item. */
export async function hideMiniWindow(): Promise<void> {
  if (!isTauri()) return;
  await invokeCommand("hide_mini_window");
}
