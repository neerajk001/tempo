import type { PomodoroPhase } from "@/types";

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

/** Asks for permission and enables notifications on grant. Never throws. */
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const result = await Notification.requestPermission();
    const granted = result === "granted";
    setNotifyEnabled(granted);
    return granted;
  } catch {
    return false;
  }
}

/** Fire-and-forget completion notice. No-op unless enabled + granted. */
export function sendCompletionNotification(phase: PomodoroPhase, taskTitle?: string | null): boolean {
  try {
    if (!isNotifyEnabled() || !notificationsSupported()) return false;
    if (Notification.permission !== "granted") return false;
    const { title, body } = completionNotification(phase, taskTitle);
    new Notification(title, { body, icon: "/icons/icon-192.png" });
    return true;
  } catch {
    return false;
  }
}
