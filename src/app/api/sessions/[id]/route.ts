import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/current-user";
import {
  calculateFocusDuration,
  calculateInterruptions,
  calculatePausedDuration,
} from "@/lib/session-analytics";

function analyticsOf(session: {
  plannedMinutes: number;
  events: Array<{ type: string; timestamp: Date }>;
}) {
  const events = session.events.map((e) => ({
    type: e.type as "START" | "PAUSE" | "RESUME" | "COMPLETE" | "CANCEL",
    timestamp: e.timestamp.getTime(),
  }));
  return {
    focusedMs: calculateFocusDuration(events),
    pausedMs: calculatePausedDuration(events),
    interruptions: calculateInterruptions(events),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const session = await db.pomodoroSession.findFirst({
      where: { id: params.id, userId: user.id },
      include: {
        task: { select: { id: true, title: true, allocatedMinutes: true } },
        events: { orderBy: { timestamp: "asc" } },
      },
    });
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json({ session: { ...session, analytics: analyticsOf(session) } });
  } catch (e) {
    console.error(`GET /api/sessions/${params.id} failed`, e);
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const existing = await db.pomodoroSession.findFirst({
      where: { id: params.id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    await db.pomodoroSession.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/sessions/${params.id} failed`, e);
    return NextResponse.json({ error: "Database unavailable or session not found." }, { status: 503 });
  }
}
