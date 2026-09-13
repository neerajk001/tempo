"use client";

/**
 * Live timer state sync.
 *
 * Tasks/sessions and settings already sync; this adds the *in-progress*
 * Pomodoro session so a running or paused session continues on another device
 * at the exact same elapsed time. Timer math is timestamp-based (absolute epoch
 * ms), so the state round-trips without drift.
 *
 * A single client timestamp (`tempo-live-meta-v1`) drives last-write-wins on
 * the server, kept separate from the settings timestamp so a preference change
 * never clobbers a newer live session (and vice versa).
 */

import {
  usePomodoroStore,
  type BreakOverride,
} from "@/stores/pomodoro-store";
import type { PomodoroState } from "@/lib/pomodoro-machine";
import type { FocusMode, PomodoroPhase, PomodoroStatus, SessionEventType } from "@/types";

const LIVE_META_KEY = "tempo-live-meta-v1";

export interface LiveState {
  session: PomodoroState;
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  quickLabel: string | null;
  breakOverride: BreakOverride | null;
  focusMode: FocusMode;
  sessionName: string | null;
}

export interface LiveBlob extends LiveState {
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Local meta (last-write-wins timestamp)
// ---------------------------------------------------------------------------

function loadUpdatedAt(): number {
  try {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem(LIVE_META_KEY);
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
    window.localStorage.setItem(LIVE_META_KEY, JSON.stringify({ updatedAt }));
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

export function collectLiveState(): LiveBlob {
  const s = usePomodoroStore.getState();
  return {
    session: s.session,
    activeTaskId: s.activeTaskId,
    activeTaskTitle: s.activeTaskTitle,
    quickLabel: s.quickLabel,
    breakOverride: s.breakOverride,
    focusMode: s.focusMode,
    sessionName: s.sessionName,
    updatedAt: loadUpdatedAt(),
  };
}

/** Pure: canonical identity of the live state (ignores the timestamp). */
export function liveFingerprint(blob: LiveState): string {
  const x = blob.session;
  return JSON.stringify({
    status: x.status,
    phase: x.phase,
    startedAt: x.startedAt,
    pausedAt: x.pausedAt,
    endedAt: x.endedAt,
    totalPausedMs: x.totalPausedMs,
    pauseCount: x.pauseCount,
    plannedMs: x.plannedMs,
    completedFocusCount: x.completedFocusCount,
    isInfinite: x.isInfinite === true,
    events: Array.isArray(x.events) ? x.events.map((e) => [e.type, e.at]) : [],
    activeTaskId: blob.activeTaskId,
    activeTaskTitle: blob.activeTaskTitle,
    quickLabel: blob.quickLabel,
    breakOverride: blob.breakOverride
      ? {
          shortBreakMs: blob.breakOverride.shortBreakMs ?? null,
          longBreakMs: blob.breakOverride.longBreakMs ?? null,
          longBreakInterval: blob.breakOverride.longBreakInterval ?? null,
        }
      : null,
    focusMode: blob.focusMode,
    sessionName: blob.sessionName,
  });
}

/** Pure: last-write-wins — adopt the remote blob only when it is newer. */
export function shouldApplyLive(local: LiveBlob, remote: LiveBlob): boolean {
  return remote.updatedAt > local.updatedAt;
}

// ---------------------------------------------------------------------------
// Normalize / apply
// ---------------------------------------------------------------------------

const num = (v: unknown, fb = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fb;
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function asStatus(v: unknown): PomodoroStatus {
  return v === "IDLE" || v === "RUNNING" || v === "PAUSED" || v === "COMPLETED" || v === "CANCELLED"
    ? v
    : "IDLE";
}
function asPhase(v: unknown): PomodoroPhase {
  return v === "FOCUS" || v === "SHORT_BREAK" || v === "LONG_BREAK" ? v : "FOCUS";
}
function asMode(v: unknown): FocusMode {
  return v === "infinite" ? "infinite" : "allocated";
}

function normalizeSession(raw: unknown): PomodoroState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    status: asStatus(r.status),
    phase: asPhase(r.phase),
    startedAt: numOrNull(r.startedAt),
    pausedAt: numOrNull(r.pausedAt),
    endedAt: numOrNull(r.endedAt),
    totalPausedMs: Math.max(0, Math.round(num(r.totalPausedMs))),
    pauseCount: Math.max(0, Math.round(num(r.pauseCount))),
    plannedMs: Math.max(0, Math.round(num(r.plannedMs))),
    completedFocusCount: Math.max(0, Math.round(num(r.completedFocusCount))),
    isInfinite: r.isInfinite === true,
    events: Array.isArray(r.events)
      ? (r.events as Array<Record<string, unknown>>)
          .filter(
            (e) =>
              e &&
              typeof e.at === "number" &&
              ["START", "PAUSE", "RESUME", "COMPLETE", "CANCEL"].includes(String(e.type))
          )
          .slice(0, 200)
          .map((e) => ({ type: e.type as SessionEventType, at: Math.round(num(e.at)) }))
      : [],
  };
}

function normalizeBreakOverride(raw: unknown): BreakOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: BreakOverride = {};
  if (typeof r.shortBreakMs === "number") out.shortBreakMs = Math.round(r.shortBreakMs);
  if (typeof r.longBreakMs === "number") out.longBreakMs = Math.round(r.longBreakMs);
  if (typeof r.longBreakInterval === "number") out.longBreakInterval = Math.round(r.longBreakInterval);
  return Object.keys(out).length > 0 ? out : null;
}

export function normalizeRemoteLive(raw: unknown): LiveBlob | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const outer = raw as Record<string, unknown>;
  const inner =
    outer.state && typeof outer.state === "object" && !Array.isArray(outer.state)
      ? (outer.state as Record<string, unknown>)
      : outer;
  const base = collectLiveState();
  return {
    session: normalizeSession(inner.session ?? inner.state ?? {}),
    activeTaskId: str(inner.activeTaskId),
    activeTaskTitle: str(inner.activeTaskTitle),
    quickLabel: str(inner.quickLabel),
    breakOverride: normalizeBreakOverride(inner.breakOverride),
    focusMode: asMode(inner.focusMode),
    sessionName: str(inner.sessionName),
    updatedAt: Math.max(0, Math.round(num(outer.updatedAt ?? inner.updatedAt, base.updatedAt))),
  };
}

let applyingLiveRemote = false;
let lastFingerprint: string | null = null;

export function applyRemoteLive(blob: LiveBlob): void {
  applyingLiveRemote = true;
  try {
    usePomodoroStore.setState({
      session: blob.session,
      activeTaskId: blob.activeTaskId,
      activeTaskTitle: blob.activeTaskTitle,
      quickLabel: blob.quickLabel,
      breakOverride: blob.breakOverride,
      focusMode: blob.focusMode,
      sessionName: blob.sessionName,
    });
    saveUpdatedAt(blob.updatedAt);
    lastFingerprint = liveFingerprint(blob);
  } finally {
    applyingLiveRemote = false;
  }
}

// ---------------------------------------------------------------------------
// Change detection -> push
// ---------------------------------------------------------------------------

let subscribed = false;

/**
 * Subscribe to the Pomodoro store and notify `onChanged` when the live state
 * actually changes (start/pause/resume/rename/interruption). A `config`-only
 * edit is ignored here — that belongs to the settings bundle.
 */
export function initLiveSync(onChanged: () => void): void {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  lastFingerprint = liveFingerprint(collectLiveState());

  usePomodoroStore.subscribe(() => {
    if (applyingLiveRemote) return;
    const fp = liveFingerprint(collectLiveState());
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    saveUpdatedAt(Date.now());
    onChanged();
  });
}
