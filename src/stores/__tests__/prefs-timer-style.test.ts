import { describe, it, expect, beforeEach } from "vitest";
import { usePrefsStore } from "@/stores/prefs-store";

beforeEach(() => {
  usePrefsStore.getState().resetPrefs();
});

describe("timer style preference", () => {
  it("defaults to the circular timer", () => {
    expect(usePrefsStore.getState().timerStyle).toBe("circular");
  });

  it("switches style without touching anything else", () => {
    const before = usePrefsStore.getState();
    before.set({ timerStyle: "analog" });
    const after = usePrefsStore.getState();
    expect(after.timerStyle).toBe("analog");
    expect(after.compact).toBe(before.compact);
    expect(after.collisionMode).toBe(before.collisionMode);
    expect(after.chimeTheme).toBe(before.chimeTheme);
  });

  it("reset restores the circular default", () => {
    usePrefsStore.getState().set({ timerStyle: "flip" });
    usePrefsStore.getState().resetPrefs();
    expect(usePrefsStore.getState().timerStyle).toBe("circular");
  });

  it("defaults timer fade/hide to off and round-trips them", () => {
    const s = usePrefsStore.getState();
    expect(s.timerFaded).toBe(false);
    expect(s.timerHidden).toBe(false);
    usePrefsStore.getState().set({ timerFaded: true, timerHidden: true });
    expect(usePrefsStore.getState().timerFaded).toBe(true);
    expect(usePrefsStore.getState().timerHidden).toBe(true);
    usePrefsStore.getState().resetPrefs();
    expect(usePrefsStore.getState().timerFaded).toBe(false);
    expect(usePrefsStore.getState().timerHidden).toBe(false);
  });
});
