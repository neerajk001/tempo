import { describe, it, expect, vi } from "vitest";
import {
  calendarEventToTaskDraft,
  getTodayEvents,
  toCalendarEvent,
  toCalendarEvents,
} from "@/services/google-calendar/calendar-client";
import { CalendarAuthError, CalendarUnavailableError } from "@/services/google-calendar/errors";

describe("calendar event mapping", () => {
  it("maps a timed event", () => {
    const e = toCalendarEvent({
      id: "abc",
      summary: "AI Agent Project",
      start: { dateTime: "2026-09-10T10:00:00+05:30" },
      end: { dateTime: "2026-09-10T16:00:00+05:30" },
      status: "confirmed",
    });
    expect(e).toMatchObject({ id: "abc", title: "AI Agent Project", allDay: false });
    expect(e!.endMs - e!.startMs).toBe(6 * 60 * 60 * 1000);
  });

  it("maps all-day events and skips cancelled/invalid items", () => {
    expect(
      toCalendarEvent({ id: "x", status: "cancelled", start: { date: "2026-09-10" }, end: { date: "2026-09-11" } })
    ).toBeNull();
    expect(toCalendarEvent({ summary: "no id" })).toBeNull();
    const allDay = toCalendarEvent({
      id: "ad",
      summary: "Holiday",
      start: { date: "2026-09-10" },
      end: { date: "2026-09-11" },
    });
    expect(allDay).toMatchObject({ allDay: true });
  });

  it("sorts events chronologically", () => {
    const events = toCalendarEvents([
      { id: "b", start: { dateTime: "2026-09-10T12:00:00Z" }, end: { dateTime: "2026-09-10T13:00:00Z" } },
      { id: "a", start: { dateTime: "2026-09-10T09:00:00Z" }, end: { dateTime: "2026-09-10T10:00:00Z" } },
    ]);
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("derives a 6h task draft from a 10:00-16:00 event", () => {
    const draft = calendarEventToTaskDraft({
      id: "abc",
      title: "AI Agent Project",
      startMs: Date.parse("2026-09-10T10:00:00+05:30"),
      endMs: Date.parse("2026-09-10T16:00:00+05:30"),
      allDay: false,
      recurring: false,
      status: "confirmed",
    });
    expect(draft).toMatchObject({
      title: "AI Agent Project",
      allocatedMinutes: 360,
      calendarEventId: "abc",
    });
  });
});

describe("calendar fetching", () => {
  it("sends singleEvents + today bounds with bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await getTodayEvents("tok", new Date(2026, 8, 10, 12, 0, 0), fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("calendar/v3/calendars/primary/events");
    expect(url).toContain("singleEvents=true");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("maps 401 to auth error and network failure to unavailable", async () => {
    const unauthorized = async () => new Response("{}", { status: 401 });
    await expect(getTodayEvents("bad", new Date(), unauthorized as unknown as typeof fetch)).rejects.toBeInstanceOf(
      CalendarAuthError
    );
    const broken = async () => {
      throw new Error("down");
    };
    await expect(getTodayEvents("tok", new Date(), broken as unknown as typeof fetch)).rejects.toBeInstanceOf(
      CalendarUnavailableError
    );
  });
});
