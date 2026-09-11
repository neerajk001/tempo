import { CalendarAuthError, CalendarUnavailableError } from "./errors";
import type { CalendarEvent, GoogleApiItem } from "./types";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Map one Google API item to our neutral event. Returns null for unusable items. */
export function toCalendarEvent(item: GoogleApiItem): CalendarEvent | null {
  if (!item.id) return null;
  if (item.status === "cancelled") return null;
  const startRaw = item.start?.dateTime ?? item.start?.date;
  const endRaw = item.end?.dateTime ?? item.end?.date;
  if (!startRaw || !endRaw) return null;
  const startMs = Date.parse(startRaw);
  const endMs = Date.parse(endRaw);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
  return {
    id: item.recurringEventId ? `${item.recurringEventId}_${item.id}` : item.id,
    title: item.summary?.trim() || "(No title)",
    description: item.description?.slice(0, 2000),
    startMs,
    endMs,
    allDay: Boolean(item.start?.date && !item.start?.dateTime),
    recurring: Boolean(item.recurringEventId),
    status: item.status ?? "confirmed",
  };
}

export function toCalendarEvents(items: GoogleApiItem[]): CalendarEvent[] {
  return items
    .map(toCalendarEvent)
    .filter((e): e is CalendarEvent => e !== null)
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * Derive a task draft from a calendar event.
 * Allocated = ceiling of event length in minutes (min 1). Date = event start local day.
 */
export function calendarEventToTaskDraft(event: CalendarEvent): {
  title: string;
  description: string;
  date: string;
  allocatedMinutes: number;
  calendarEventId: string;
} {
  const d = new Date(event.startMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    title: event.title,
    description: event.description ?? "",
    date: `${y}-${m}-${day}`,
    allocatedMinutes: Math.max(1, Math.ceil((event.endMs - event.startMs) / 60000)),
    calendarEventId: event.id,
  };
}

async function fetchEvents(
  accessToken: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<CalendarEvent[]> {
  const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new CalendarUnavailableError("Calendar unavailable (network). Local timer keeps working.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError();
  }
  if (!res.ok) {
    throw new CalendarUnavailableError(`Calendar unavailable (HTTP ${res.status}). Local timer keeps working.`);
  }
  const data = (await res.json()) as { items?: GoogleApiItem[] };
  return toCalendarEvents(data.items ?? []);
}

const BASE_PARAMS = {
  singleEvents: "true",
  orderBy: "startTime",
  maxResults: "50",
} as const;

/** Events between two instants. */
export async function getEventsBetween(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
  fetchImpl: typeof fetch = fetch
): Promise<CalendarEvent[]> {
  if (!accessToken) throw new CalendarAuthError();
  return fetchEvents(
    accessToken,
    { ...BASE_PARAMS, timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() },
    fetchImpl
  );
}

/** Today's events in the server's local day bounds. */
export async function getTodayEvents(
  accessToken: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<CalendarEvent[]> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return getEventsBetween(accessToken, start, end, fetchImpl);
}

/** Back-compat alias for the phase spec naming. */
export const getCalendarEvents = getEventsBetween;
