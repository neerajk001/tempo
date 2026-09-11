import { describe, it, expect } from "vitest";
import { dayBounds, initialScrollTop } from "@/components/calendar/DayTimeline";

const at = (h: number, m = 0) => new Date(2026, 8, 10, h, m, 0).getTime();

describe("dayBounds", () => {
  it("stays on the default 08:00–19:00 window for daytime events", () => {
    expect(
      dayBounds([{ startMs: at(10), endMs: at(12) }], [])
    ).toEqual({ startHour: 8, endHour: 19 });
  });

  it("expands to include a late-night 21:30–23:00 event", () => {
    expect(
      dayBounds([{ startMs: at(21, 30), endMs: at(23) }], [])
    ).toEqual({ startHour: 8, endHour: 23 });
  });

  it("expands downward for early-morning blocks and clamps to the day", () => {
    expect(
      dayBounds([], [{ startMs: at(5, 15), endMs: at(6) }])
    ).toEqual({ startHour: 5, endHour: 19 });
  });

  it("ignores all-day events", () => {
    expect(
      dayBounds([{ startMs: at(0), endMs: at(23, 59), allDay: true }], [])
    ).toEqual({ startHour: 8, endHour: 19 });
  });
});

describe("initialScrollTop", () => {
  const start = at(8);

  it("jumps near the now-cursor when live", () => {
    // now = 10:00, 2h in → 160px − 200 pad → clamped 0 only if negative
    expect(initialScrollTop(true, at(14), start)).toBe(6 * 80 - 200);
  });

  it("jumps to the first block otherwise", () => {
    expect(initialScrollTop(false, at(21, 30), start)).toBe(13.5 * 80 - 200);
  });

  it("stays at top with nothing to anchor to", () => {
    expect(initialScrollTop(false, null, start)).toBe(0);
    expect(initialScrollTop(true, start - 3600000, start)).toBe(0);
  });
});
