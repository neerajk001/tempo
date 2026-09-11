import { describe, it, expect } from "vitest";
import {
  completionNotification,
  isNotifyEnabled,
  notificationsSupported,
} from "@/lib/notifications";

describe("notifications", () => {
  it("builds a focus-complete notice naming the task", () => {
    expect(completionNotification("FOCUS", "AI Agent Project")).toEqual({
      title: "Pomodoro complete",
      body: "Focused on AI Agent Project — time for a break.",
    });
  });

  it("builds a break-complete notice", () => {
    expect(completionNotification("SHORT_BREAK")).toEqual({
      title: "Break complete",
      body: "Ready for the next focus session.",
    });
    expect(completionNotification("LONG_BREAK").title).toBe("Break complete");
  });

  it("stays disabled outside the browser", () => {
    expect(notificationsSupported()).toBe(false);
    expect(isNotifyEnabled()).toBe(false);
  });
});
