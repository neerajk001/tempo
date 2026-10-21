import type { PomodoroPhase } from "@/types";
import { isTauri } from "@/lib/desktop";

const STORAGE_KEY = "tempo-notify-enabled";

export function completionNotification(
  phase: PomodoroPhase,
  taskTitle?: string | null
): { title: string; body: string } {
  if (phase === "FOCUS") {
    return {
      title: "Pomodoro complete",
      body: taskTitle ? `Focused on ${taskTitle} — time for a break.` : "Focus session done — time for a break.",
    };
  }
  return {
    title: "Break complete",
    body: "Ready for the next focus session.",
  };
}

export function notificationsSupported(): boolean {
  if (isTauri()) return true;
  return typeof window !== "undefined" && "Notification" in window;
}

export function isNotifyEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotifyEnabled(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Optional enhancement — ignore storage failures.
  }
}

/** Current permission state, normalized across the web and desktop shells. */
export async function notificationPermissionState(): Promise<
  "granted" | "denied" | "default" | "unsupported"
> {
  if (isTauri()) {
    try {
      const mod = await import("@tauri-apps/plugin-notification");
      return (await mod.isPermissionGranted()) ? "granted" : "default";
    } catch {
      return "unsupported";
    }
  }
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Request permission (native toast on desktop, Web Notification on web). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      const mod = await import("@tauri-apps/plugin-notification");
      if (await mod.isPermissionGranted()) return true;
      return (await mod.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Asks for permission and enables notifications on grant. Never throws. */
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const granted = await requestNotificationPermission();
  setNotifyEnabled(granted);
  return granted;
}

async function sendNative(title: string, body: string): Promise<void> {
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    if (!(await mod.isPermissionGranted())) return;
    mod.sendNotification({ title, body });
  } catch {
    // Never block the timer on a notification failure.
  }
}

/**
 * Fire-and-forget completion notice. Enablement is decided by the caller via
 * prefs (notifyFocus/notifyBreak) — this helper only checks support/permission.
 */
export function sendCompletionNotification(phase: PomodoroPhase, taskTitle?: string | null): boolean {
  try {
    const { title, body } = completionNotification(phase, taskTitle);
    if (isTauri()) {
      void sendNative(title, body);
      return true;
    }
    if (!notificationsSupported()) return false;
    if (Notification.permission !== "granted") return false;
    new Notification(title, { body, icon: "/icons/icon-192.png" });
    return true;
  } catch {
    return false;
  }
}
