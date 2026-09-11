import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/current-user";
import { calendarEventToTaskDraft } from "@/services/google-calendar";

/**
 * POST /api/calendar/to-task { event: CalendarEvent }
 * Converts a fetched Calendar event into a Task, storing the external event ID.
 * Idempotent: an existing task with the same calendarEventId is returned as-is.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const body = (await req.json()) as {
      event?: {
        id?: string;
        title?: string;
        description?: string;
        startMs?: number;
        endMs?: number;
        allDay?: boolean;
      };
    };
    const e = body.event;
    if (!e || typeof e.id !== "string" || !e.id) {
      return NextResponse.json({ error: "event.id is required" }, { status: 400 });
    }
    if (typeof e.startMs !== "number" || typeof e.endMs !== "number" || e.endMs <= e.startMs) {
      return NextResponse.json({ error: "event needs valid startMs/endMs" }, { status: 400 });
    }

    const existing = await db.task.findFirst({ where: { calendarEventId: e.id, userId: user.id } });
    if (existing) return NextResponse.json({ task: existing, deduped: true });

    const draft = calendarEventToTaskDraft({
      id: e.id,
      title: typeof e.title === "string" && e.title.trim() ? e.title : "(No title)",
      description: typeof e.description === "string" ? e.description : undefined,
      startMs: e.startMs,
      endMs: e.endMs,
      allDay: Boolean(e.allDay),
      recurring: false,
      status: "confirmed",
    });

    const task = await db.task.create({
      data: {
        userId: user.id,
        title: draft.title.slice(0, 200),
        description: draft.description || null,
        date: new Date(`${draft.date}T00:00:00.000Z`),
        allocatedMinutes: draft.allocatedMinutes,
        calendarEventId: draft.calendarEventId,
      },
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("POST /api/calendar/to-task failed", err);
    return NextResponse.json(
      { error: "Database unavailable. The task can still be planned locally." },
      { status: 503 }
    );
  }
}
