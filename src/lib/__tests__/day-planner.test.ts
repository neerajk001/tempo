import { describe, it, expect } from "vitest";
import {
  detectConflicts,
  generatePomodoroBlocks,
  planCoverage,
  subtractBusy,
  totalMs,
  type BusyEvent,
} from "@/lib/day-planner";

const MIN = 60_000;
const H = 60 * MIN;
// Sept 10 2026, local times
const T = (h: number, m = 0) => new Date(2026, 8, 10, h, m, 0).getTime();

describe("subtractBusy", () => {
  it("splits a 09:00-12:00 container around a mid-window meeting", () => {
    const free = subtractBusy(
      { startMs: T(9), endMs: T(12) },
      [{ startMs: T(10), endMs: T(10, 30) }]
    );
    expect(free).toEqual([
      { startMs: T(9), endMs: T(10) },
      { startMs: T(10, 30), endMs: T(12) },
    ]);
  });

  it("returns the whole container when nothing overlaps", () => {
    const free = subtractBusy({ startMs: T(9), endMs: T(12) }, [
      { startMs: T(14), endMs: T(15) },
    ]);
    expect(free).toEqual([{ startMs: T(9), endMs: T(12) }]);
    expect(totalMs(free)).toBe(3 * H);
  });

  it("merges overlapping busy intervals and clips to container", () => {
    const free = subtractBusy({ startMs: T(9), endMs: T(12) }, [
      { startMs: T(8), endMs: T(9, 30) },
      { startMs: T(9, 15), endMs: T(10) },
      { startMs: T(11, 30), endMs: T(13) },
    ]);
    expect(free).toEqual([{ startMs: T(10), endMs: T(11, 30) }]);
  });

  it("returns empty when fully busy", () => {
    expect(subtractBusy({ startMs: T(9), endMs: T(10) }, [{ startMs: T(9), endMs: T(10) }])).toEqual([]);
  });
});

describe("generatePomodoroBlocks", () => {
  it("fills 09:00-12:00 with 50/10 as in the spec example", () => {
    const blocks = generatePomodoroBlocks({
      free: [{ startMs: T(9), endMs: T(12) }],
      focusMs: 50 * MIN,
      breakMs: 10 * MIN,
      remainingMs: 10 * H,
    });
    expect(blocks).toEqual([
      { type: "focus", startMs: T(9), endMs: T(9, 50), minutes: 50, partial: false },
      { type: "break", startMs: T(9, 50), endMs: T(10), minutes: 10 },
      { type: "focus", startMs: T(10), endMs: T(10, 50), minutes: 50, partial: false },
      { type: "break", startMs: T(10, 50), endMs: T(11), minutes: 10 },
      { type: "focus", startMs: T(11), endMs: T(11, 50), minutes: 50, partial: false },
      { type: "break", startMs: T(11, 50), endMs: T(12), minutes: 10 },
    ]);
  });

  it("caps focus at remaining work with a partial final session", () => {
    // Remaining 2h40m = 160m -> 50+50+50+10 focus
    const blocks = generatePomodoroBlocks({
      free: [{ startMs: T(9), endMs: T(14) }],
      focusMs: 50 * MIN,
      breakMs: 10 * MIN,
      remainingMs: 160 * MIN,
    });
    const focus = blocks.filter((b) => b.type === "focus");
    expect(focus.map((b) => b.minutes)).toEqual([50, 50, 50, 10]);
    expect(focus[3].partial).toBe(true);
    // No trailing break after the last focus
    expect(blocks[blocks.length - 1].type).toBe("focus");
  });

  it("skips busy-split segments correctly and carries breaks across", () => {
    const free = subtractBusy({ startMs: T(9), endMs: T(12) }, [
      { startMs: T(9, 50), endMs: T(10) }, // eats the first break slot
    ]);
    const blocks = generatePomodoroBlocks({
      free,
      focusMs: 50 * MIN,
      breakMs: 10 * MIN,
      remainingMs: 10 * H,
    });
    expect(blocks[0]).toMatchObject({ type: "focus", startMs: T(9), endMs: T(9, 50) });
    // Break resumes at 10:00 in the next segment
    expect(blocks[1]).toMatchObject({ type: "break", startMs: T(10), endMs: T(10, 10) });
  });

  it("returns no blocks for non-positive remaining work", () => {
    expect(
      generatePomodoroBlocks({ free: [{ startMs: T(9), endMs: T(12) }], focusMs: 50 * MIN, breakMs: 10 * MIN, remainingMs: 0 })
    ).toEqual([]);
  });
});

describe("detectConflicts", () => {
  const meeting: BusyEvent = { id: "m1", title: "Meeting", startMs: T(14), endMs: T(15) };

  it("flags a focus block overlapping a meeting", () => {
    const conflicts = detectConflicts(
      [{ type: "focus", startMs: T(14, 30), endMs: T(15, 20), minutes: 50 }],
      [meeting]
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].event.title).toBe("Meeting");
  });

  it("ignores touching endpoints", () => {
    const conflicts = detectConflicts(
      [{ type: "focus", startMs: T(13), endMs: T(14), minutes: 60 }],
      [meeting]
    );
    expect(conflicts).toEqual([]);
  });

  it("generated plans have no conflicts by construction", () => {
    const container = { startMs: T(9), endMs: T(12) };
    const busy: BusyEvent[] = [{ id: "m", title: "Standup", startMs: T(10), endMs: T(10, 15) }];
    const free = subtractBusy(container, busy);
    const blocks = generatePomodoroBlocks({ free, focusMs: 50 * MIN, breakMs: 10 * MIN, remainingMs: 10 * H });
    expect(detectConflicts(blocks, busy)).toEqual([]);
  });
});

describe("planCoverage", () => {
  it("reports shortfall when free time is smaller than remaining work", () => {
    const c = planCoverage(
      [{ type: "focus", startMs: T(9), endMs: T(9, 50), minutes: 50 }],
      160 * MIN
    );
    expect(c.coversAll).toBe(false);
    expect(c.shortfallMs).toBe(110 * MIN);
  });
});
