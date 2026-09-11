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

  it("defaults the floating overlay to centered, full-size, visible", () => {
    const s = usePrefsStore.getState();
    expect(s.timerScale).toBe(1);
    expect(s.timerPos).toBeNull();
    expect(s.timerHidden).toBe(false);
  });

  it("persists overlay prefs through set/reset", () => {
    usePrefsStore.getState().set({ timerScale: 1.3, timerPos: { x: 40, y: -20 }, timerHidden: true });
    const s = usePrefsStore.getState();
    expect(s.timerScale).toBe(1.3);
    expect(s.timerPos).toEqual({ x: 40, y: -20 });
    expect(s.timerHidden).toBe(true);
    usePrefsStore.getState().resetPrefs();
    const r = usePrefsStore.getState();
    expect(r.timerScale).toBe(1);
    expect(r.timerPos).toBeNull();
    expect(r.timerHidden).toBe(false);
  });
});
