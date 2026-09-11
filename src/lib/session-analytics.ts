import type { SessionEventType } from "@/types";

export interface AnalyticsEvent {
  type: SessionEventType;
  /** epoch ms (accepts Date/string for DB rows) */
  timestamp: number | Date | string;
}

export function toMs(t: number | Date | string): number {
  if (typeof t === "number") return t;
  if (t instanceof Date) return t.getTime();
  const n = Date.parse(t);
  if (Number.isNaN(n)) throw new Error("Invalid timestamp");
  return n;
}

/** Every PAUSE counts as one interruption. */
export function calculateInterruptions(events: AnalyticsEvent[]): number {
  return events.filter((e) => e.type === "PAUSE").length;
}

/**
 * Total paused time from an event timeline.
 * Pairs each PAUSE with the next RESUME/COMPLETE/CANCEL; an open PAUSE
 * (no later event) counts until `endMs` (defaults to now).
 * Pure — no Date.now() inside unless endMs omitted (pass explicit end in tests).
 */
export function calculatePausedDuration(
  events: AnalyticsEvent[],
  endMs: number = Date.now()
): number {
  const sorted = [...events]
    .map((e) => ({ type: e.type, at: toMs(e.timestamp) }))
    .sort((a, b) => a.at - b.at);

  let total = 0;
  let openPause: number | null = null;
  for (const e of sorted) {
    if (e.type === "PAUSE") {
      // Ignore duplicate PAUSE without RESUME (keep first)
      if (openPause === null) openPause = e.at;
    } else if (e.type === "RESUME" || e.type === "COMPLETE" || e.type === "CANCEL") {
      if (openPause !== null) {
        total += Math.max(0, e.at - openPause);
        openPause = null;
      }
    }
  }
  if (openPause !== null) total += Math.max(0, endMs - openPause);
  return total;
}

/**
 * Actual focused time = wall time (end - start) minus paused time.
 * START is required; end = COMPLETE/CANCEL timestamp, or `endMs` for active sessions.
 */
export function calculateFocusDuration(
  events: AnalyticsEvent[],
  endMs: number = Date.now()
): number {
  const sorted = [...events]
    .map((e) => ({ type: e.type, at: toMs(e.timestamp) }))
    .sort((a, b) => a.at - b.at);
  const start = sorted.find((e) => e.type === "START");
  if (!start) return 0;
  const terminal = [...sorted]
    .reverse()
    .find((e) => e.type === "COMPLETE" || e.type === "CANCEL");
  const end = terminal ? terminal.at : endMs;
  const wall = Math.max(0, end - start.at);
  const paused = calculatePausedDuration(events, end);
  return Math.max(0, wall - paused);
}

/** Focused vs planned, 0-100 clamped. Pure. */
export function calculateCompletionRate(plannedMs: number, focusedMs: number): number {
  if (!Number.isFinite(plannedMs) || plannedMs <= 0) return 0;
  if (!Number.isFinite(focusedMs) || focusedMs <= 0) return 0;
  return Math.min(100, Math.round((focusedMs / plannedMs) * 100));
}

export interface SessionSummary {
  focusedMs: number;
  pausedMs: number;
  interruptions: number;
  completionRate: number;
  startedAt: number | null;
  endedAt: number | null;
}

export function summarizeSession(input: {
  events: AnalyticsEvent[];
  plannedMs: number;
  endMs?: number;
}): SessionSummary {
  const sorted = [...input.events]
    .map((e) => ({ type: e.type, at: toMs(e.timestamp) }))
    .sort((a, b) => a.at - b.at);
  const start = sorted.find((e) => e.type === "START");
  const terminal = [...sorted]
    .reverse()
    .find((e) => e.type === "COMPLETE" || e.type === "CANCEL");
  const endMs = terminal ? terminal.at : (input.endMs ?? Date.now());
  return {
    focusedMs: calculateFocusDuration(input.events, endMs),
    pausedMs: calculatePausedDuration(input.events, endMs),
    interruptions: calculateInterruptions(input.events),
    completionRate: calculateCompletionRate(
      input.plannedMs,
      calculateFocusDuration(input.events, endMs)
    ),
    startedAt: start ? start.at : null,
    endedAt: terminal ? terminal.at : null,
  };
}
