"use client";

/**
 * Settings sync bundle for cross-device parity.
 *
 * Tasks and sessions sync through the main engine (sync.ts); this module adds
 * the remaining user preferences so a second device gets an identical Tempo:
 * prefs, Pomodoro cadence, ambient selection, and logged diversions.
 *
 * The live timer session is deliberately excluded (per-device run state), and
 * the ambient `*Playing` flags are session-only. A single client timestamp
 * (`tempo-settings-meta-v1`) drives last-write-wins on the server.
 */

import { usePrefsStore, type ChimeTheme, type TimerStyle } from "@/stores/prefs-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { useAmbientStore } from "@/stores/ambient-store";
import { useDiversionStore, type Diversion } from "@/stores/diversion-store";

const SETTINGS_META_KEY = "tempo-settings-meta-v1";

export interface SyncedPrefs {
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  notifyFocus: boolean;
  notifyBreak: boolean;
  reviewPrompt: boolean;
  chimeTheme: ChimeTheme;
  compact: boolean;
  timerStyle: TimerStyle;
  timerFaded: boolean;
  timerHidden: boolean;
}

export interface SyncedPomodoro {
  focusMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  longBreakInterval: number;
}

export interface SyncedAmbient {
  videoId: string | null;
  trackId: string | null;
  videoVolume: number;
  musicVolume: number;
  videoMuted: boolean;
  musicMuted: boolean;
  videoEnabled: boolean;
  musicEnabled: boolean;
}

export interface SettingsBlob {
  prefs: SyncedPrefs;
  pomodoro: SyncedPomodoro;
  ambient: SyncedAmbient;
  diversions: Diversion[];
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Local meta (last-write-wins timestamp)
// ---------------------------------------------------------------------------

function loadUpdatedAt(): number {
  try {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem(SETTINGS_META_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
  } catch {
    return 0;
  }
}

function saveUpdatedAt(updatedAt: number): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SETTINGS_META_KEY, JSON.stringify({ updatedAt }));
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Collect / apply
// ---------------------------------------------------------------------------

export function collectLocalSettings(): SettingsBlob {
  const p = usePrefsStore.getState();
  const cfg = usePomodoroStore.getState().config;
  const a = useAmbientStore.getState();
  const diversions = useDiversionStore.getState().diversions;
  return {
    prefs: {
      autoStartBreaks: p.autoStartBreaks,
      autoStartFocus: p.autoStartFocus,
      notifyFocus: p.notifyFocus,
      notifyBreak: p.notifyBreak,
      reviewPrompt: p.reviewPrompt,
      chimeTheme: p.chimeTheme,
      compact: p.compact,
      timerStyle: p.timerStyle,
      timerFaded: p.timerFaded,
      timerHidden: p.timerHidden,
    },
    pomodoro: {
      focusMs: cfg.focusMs,
      shortBreakMs: cfg.shortBreakMs,
      longBreakMs: cfg.longBreakMs,
      longBreakInterval: cfg.longBreakInterval,
    },
    ambient: {
      videoId: a.videoId,
      trackId: a.trackId,
      videoVolume: a.videoVolume,
      musicVolume: a.musicVolume,
      videoMuted: a.videoMuted,
      musicMuted: a.musicMuted,
      videoEnabled: a.videoEnabled,
      musicEnabled: a.musicEnabled,
    },
    diversions: Array.isArray(diversions) ? diversions : [],
    updatedAt: loadUpdatedAt(),
  };
}

/** Pure: stable identity of the synced payload (ignores the timestamp). */
export function settingsFingerprint(blob: SettingsBlob): string {
  return JSON.stringify({
    prefs: blob.prefs,
    pomodoro: blob.pomodoro,
    ambient: blob.ambient,
    diversions: blob.diversions,
  });
}

/** Pure: last-write-wins — apply the remote blob only when it is newer. */
export function shouldApplySettings(local: SettingsBlob, remote: SettingsBlob): boolean {
  return remote.updatedAt > local.updatedAt;
}

export function normalizeRemoteSettings(raw: unknown): SettingsBlob | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const base = collectLocalSettings();
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

  const prefsR = obj(r.prefs);
  const pomoR = obj(r.pomodoro);
  const ambR = obj(r.ambient);

  const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fb;
  const strOrNull = (v: unknown, fb: string | null) =>
    typeof v === "string" ? v : v === null ? null : fb;

  const chime: ChimeTheme =
    prefsR.chimeTheme === "chime" ||
    prefsR.chimeTheme === "marimba" ||
    prefsR.chimeTheme === "bell" ||
    prefsR.chimeTheme === "muted"
      ? prefsR.chimeTheme
      : base.prefs.chimeTheme;
  const timerStyle: TimerStyle =
    prefsR.timerStyle === "circular" || prefsR.timerStyle === "flip" || prefsR.timerStyle === "analog"
      ? prefsR.timerStyle
      : base.prefs.timerStyle;

  return {
    prefs: {
      autoStartBreaks: bool(prefsR.autoStartBreaks, base.prefs.autoStartBreaks),
      autoStartFocus: bool(prefsR.autoStartFocus, base.prefs.autoStartFocus),
      notifyFocus: bool(prefsR.notifyFocus, base.prefs.notifyFocus),
      notifyBreak: bool(prefsR.notifyBreak, base.prefs.notifyBreak),
      reviewPrompt: bool(prefsR.reviewPrompt, base.prefs.reviewPrompt),
      chimeTheme: chime,
      compact: bool(prefsR.compact, base.prefs.compact),
      timerStyle,
      timerFaded: bool(prefsR.timerFaded, base.prefs.timerFaded),
      timerHidden: bool(prefsR.timerHidden, base.prefs.timerHidden),
    },
    pomodoro: {
      focusMs: num(pomoR.focusMs, base.pomodoro.focusMs),
      shortBreakMs: num(pomoR.shortBreakMs, base.pomodoro.shortBreakMs),
      longBreakMs: num(pomoR.longBreakMs, base.pomodoro.longBreakMs),
      longBreakInterval: num(pomoR.longBreakInterval, base.pomodoro.longBreakInterval),
    },
    ambient: {
      videoId: strOrNull(ambR.videoId, base.ambient.videoId),
      trackId: strOrNull(ambR.trackId, base.ambient.trackId),
      videoVolume: num(ambR.videoVolume, base.ambient.videoVolume),
      musicVolume: num(ambR.musicVolume, base.ambient.musicVolume),
      videoMuted: bool(ambR.videoMuted, base.ambient.videoMuted),
      musicMuted: bool(ambR.musicMuted, base.ambient.musicMuted),
      videoEnabled: bool(ambR.videoEnabled, base.ambient.videoEnabled),
      musicEnabled: bool(ambR.musicEnabled, base.ambient.musicEnabled),
    },
    diversions: Array.isArray(r.diversions)
      ? (r.diversions as Diversion[]).filter(
          (d) => d && typeof d.id === "string" && typeof d.title === "string"
        )
      : base.diversions,
    updatedAt: num(r.updatedAt, 0),
  };
}

let applyingSettingsRemote = false;
let lastFingerprint: string | null = null;

export function isApplyingSettingsRemote(): boolean {
  return applyingSettingsRemote;
}

export function applyRemoteSettings(blob: SettingsBlob): void {
  applyingSettingsRemote = true;
  try {
    usePrefsStore.setState({ ...blob.prefs });
    usePomodoroStore.setState((s) => ({ config: { ...s.config, ...blob.pomodoro } }));
    useAmbientStore.setState({ ...blob.ambient });
    useDiversionStore.setState({ diversions: blob.diversions });
    saveUpdatedAt(blob.updatedAt);
    lastFingerprint = settingsFingerprint(blob);
  } finally {
    applyingSettingsRemote = false;
  }
}

// ---------------------------------------------------------------------------
// Change detection -> push
// ---------------------------------------------------------------------------

let subscribed = false;

/**
 * Subscribe to the settings stores and notify `onChanged` when the synced
 * payload actually changes. Fingerprint diffing keeps live timer ticks from
 * triggering spurious pushes.
 */
export function initSettingsSync(onChanged: () => void): void {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  lastFingerprint = settingsFingerprint(collectLocalSettings());

  const check = () => {
    if (applyingSettingsRemote) return;
    const fp = settingsFingerprint(collectLocalSettings());
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    saveUpdatedAt(Date.now());
    onChanged();
  };

  usePrefsStore.subscribe(check);
  usePomodoroStore.subscribe(check);
  useAmbientStore.subscribe(check);
  useDiversionStore.subscribe(check);
}
