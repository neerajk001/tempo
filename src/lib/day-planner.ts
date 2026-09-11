export interface TimeSegment {
  startMs: number;
  endMs: number;
}

export interface BusyEvent extends TimeSegment {
  id: string;
  title: string;
}

export interface WorkBlock extends TimeSegment {
  type: "focus" | "break";
  minutes: number;
  /** true when a focus block is shorter than the configured focus length */
  partial?: boolean;
}

export interface Conflict<B extends WorkBlock = WorkBlock> {
  block: B;
  event: BusyEvent;
}

/**
 * Subtract busy intervals from a container window.
 * Busy intervals are clipped to the container, merged, then removed,
 * leaving usable free segments in chronological order.
 * Pure — never mutates inputs (no silent overwrites of calendar data).
 */
export function subtractBusy(container: TimeSegment, busy: TimeSegment[]): TimeSegment[] {
  const clipped = busy
    .map((b) => ({
      startMs: Math.max(b.startMs, container.startMs),
      endMs: Math.min(b.endMs, container.endMs),
    }))
    .filter((b) => b.endMs > b.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: TimeSegment[] = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, b.endMs);
    } else {
      merged.push({ ...b });
    }
  }

  const free: TimeSegment[] = [];
  let cursor = container.startMs;
  for (const b of merged) {
    if (b.startMs > cursor) free.push({ startMs: cursor, endMs: b.startMs });
    cursor = Math.max(cursor, b.endMs);
  }
  if (cursor < container.endMs) free.push({ startMs: cursor, endMs: container.endMs });
  return free;
}

export function totalMs(segments: TimeSegment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, s.endMs - s.startMs), 0);
}

export interface GenerateOptions {
  free: TimeSegment[];
  focusMs: number;
  breakMs: number;
  /** cap on total focus (e.g. task remaining work); <=0 yields no blocks */
  remainingMs: number;
}

/**
 * Fill free segments with alternating focus/break blocks.
 * - Starts with focus; a break follows only while more focus remains.
 * - The final focus block may be partial (shorter than focusMs).
 * - Breaks that don't fit in a segment's remainder continue in the next segment.
 */
export function generatePomodoroBlocks(opts: GenerateOptions): WorkBlock[] {
  const { free, focusMs, breakMs, remainingMs } = opts;
  if (focusMs <= 0 || breakMs <= 0 || remainingMs <= 0) return [];
  const blocks: WorkBlock[] = [];
  let focusLeft = remainingMs;
  let want: "focus" | "break" = "focus";

  for (const seg of free) {
    let cursor = seg.startMs;
    while (cursor < seg.endMs && focusLeft > 0) {
      if (want === "focus") {
        const len = Math.min(focusMs, focusLeft, seg.endMs - cursor);
        if (len <= 0) break;
        blocks.push({
          type: "focus",
          startMs: cursor,
          endMs: cursor + len,
          minutes: Math.round(len / 60000),
          partial: len < focusMs,
        });
        cursor += len;
        focusLeft -= len;
        want = "break";
      } else {
        // Break only matters while more focus remains; stop otherwise.
        if (focusLeft <= 0) break;
        const len = Math.min(breakMs, seg.endMs - cursor);
        if (len <= 0) break;
        blocks.push({ type: "break", startMs: cursor, endMs: cursor + len, minutes: Math.round(len / 60000) });
        cursor += len;
        want = "focus";
      }
    }
    if (focusLeft <= 0) break;
    // Carry a pending break into the next segment (keep alternation).
  }
  return blocks;
}

/** True when two intervals overlap (touching endpoints do not count). */
export function overlaps(a: TimeSegment, b: TimeSegment): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Find planned blocks that overlap busy calendar events.
 * Used after the user adjusts a plan — generation itself only uses free time,
 * so conflicts imply manual edits or calendar changes.
 */
export function detectConflicts<B extends WorkBlock>(blocks: B[], busy: BusyEvent[]): Array<Conflict<B>> {
  const conflicts: Array<Conflict<B>> = [];
  for (const block of blocks) {
    for (const event of busy) {
      if (overlaps(block, event)) conflicts.push({ block, event });
    }
  }
  return conflicts;
}

export interface PlanCoverage {
  plannedFocusMs: number;
  remainingMs: number;
  coversAll: boolean;
  shortfallMs: number;
}

export function planCoverage(blocks: WorkBlock[], remainingMs: number): PlanCoverage {
  const plannedFocusMs = blocks
    .filter((b) => b.type === "focus")
    .reduce((sum, b) => sum + Math.max(0, b.endMs - b.startMs), 0);
  return {
    plannedFocusMs,
    remainingMs,
    coversAll: plannedFocusMs >= remainingMs,
    shortfallMs: Math.max(0, remainingMs - plannedFocusMs),
  };
}
