import { describe, it, expect } from "vitest";
import {
  settingsFingerprint,
  shouldApplySettings,
  type SettingsBlob,
} from "@/lib/settings-sync";

function blob(partial: Partial<SettingsBlob> = {}): SettingsBlob {
  const base: SettingsBlob = {
    prefs: {
      autoStartBreaks: true,
      autoStartFocus: false,
      notifyFocus: false,
      notifyBreak: false,
      reviewPrompt: false,
      chimeTheme: "chime",
      compact: false,
      timerStyle: "circular",
      timerFaded: false,
      timerHidden: false,
    },
    pomodoro: {
      focusMs: 50 * 60 * 1000,
      shortBreakMs: 10 * 60 * 1000,
      longBreakMs: 30 * 60 * 1000,
      longBreakInterval: 4,
    },
    ambient: {
      videoId: null,
      trackId: null,
      videoVolume: 0.5,
      musicVolume: 0.5,
      videoMuted: true,
      musicMuted: false,
      videoEnabled: false,
      musicEnabled: false,
    },
    diversions: [],
    updatedAt: 0,
  };
  return { ...base, ...partial };
}

describe("settingsFingerprint", () => {
  it("ignores the last-write-wins timestamp", () => {
    expect(settingsFingerprint(blob({ updatedAt: 1 }))).toBe(
      settingsFingerprint(blob({ updatedAt: 999_999 }))
    );
  });

  it("changes when a synced field changes", () => {
    const a = blob();
    const b = blob({ prefs: { ...a.prefs, compact: true } });
    const c = blob({ pomodoro: { ...a.pomodoro, focusMs: 25 * 60 * 1000 } });
    const d = blob({ ambient: { ...a.ambient, trackId: "rain" } });
    expect(settingsFingerprint(a)).not.toBe(settingsFingerprint(b));
    expect(settingsFingerprint(a)).not.toBe(settingsFingerprint(c));
    expect(settingsFingerprint(a)).not.toBe(settingsFingerprint(d));
  });
});

describe("shouldApplySettings (last-write-wins)", () => {
  it("applies a strictly newer remote", () => {
    expect(shouldApplySettings(blob({ updatedAt: 1 }), blob({ updatedAt: 2 }))).toBe(true);
  });

  it("keeps local when timestamps are equal", () => {
    expect(shouldApplySettings(blob({ updatedAt: 2 }), blob({ updatedAt: 2 }))).toBe(false);
  });

  it("keeps local when local is newer", () => {
    expect(shouldApplySettings(blob({ updatedAt: 3 }), blob({ updatedAt: 2 }))).toBe(false);
  });
});
