import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import {
  CalendarAuthError,
  CalendarUnavailableError,
  getEventsBetween,
  getTodayEvents,
} from "@/services/google-calendar";

function parseDateOnly(value: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * GET /api/calendar/events?date=YYYY-MM-DD (default today)
 * or ?timeMin=ISO&timeMax=ISO. Requires Google sign-in.
 * The Google access token is read server-side from the JWT — it is never
 * exposed to the browser. Calendar failures return 503, never tokens.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Connect Google Calendar to see planned events.", needsAuth: true },
      { status: 401 }
    );
  }
  if (session.calendarError) {
    return NextResponse.json(
      { error: "Google Calendar needs reconnect. Sign in again.", needsAuth: true },
      { status: 401 }
    );
  }
  const token = await getToken({ req: req as never });
  const accessToken = token?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Google Calendar needs reconnect. Sign in again.", needsAuth: true },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);
    const timeMin = url.searchParams.get("timeMin");
    const timeMax = url.searchParams.get("timeMax");
    if (timeMin && timeMax) {
      const events = await getEventsBetween(accessToken, new Date(timeMin), new Date(timeMax));
      return NextResponse.json({ events });
    }
    const dateParam = url.searchParams.get("date");
    if (dateParam) {
      const bounds = parseDateOnly(dateParam);
      if (!bounds) {
        return NextResponse.json({ error: "Invalid ?date=, expected YYYY-MM-DD" }, { status: 400 });
      }
      const events = await getEventsBetween(accessToken, bounds.start, bounds.end);
      return NextResponse.json({ events });
    }
    const events = await getTodayEvents(accessToken);
    return NextResponse.json({ events });
  } catch (e) {
    if (e instanceof CalendarAuthError) {
      return NextResponse.json(
        { error: "Google Calendar needs reconnect. Sign in again.", needsAuth: true },
        { status: 401 }
      );
    }
    const message =
      e instanceof CalendarUnavailableError
        ? e.message
        : "Calendar unavailable. Your locally created tasks and Pomodoro timer will continue working.";
    console.error("GET /api/calendar/events failed", e);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
