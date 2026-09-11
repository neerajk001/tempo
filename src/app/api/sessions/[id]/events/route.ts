import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/current-user";

const ALLOWED = ["PAUSE", "RESUME", "COMPLETE", "CANCEL"] as const;
type Allowed = (typeof ALLOWED)[number];

/**
 * POST /api/sessions/:id/events { type }
 * Server validates the state machine; durations are always derived
 * from stored timestamps, never from client-provided values.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const body = (await req.json()) as Record<string, unknown>;
    const type = body.type as Allowed;
    if (!ALLOWED.includes(type)) {
      return NextResponse.json({ error: "type must be PAUSE | RESUME | COMPLETE | CANCEL" }, { status: 400 });
    }

    const session = await db.pomodoroSession.findFirst({
      where: { id: params.id, userId: user.id },
      include: { events: { orderBy: { timestamp: "desc" }, take: 1 } },
    });
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const valid =
      (session.status === "RUNNING" && (type === "PAUSE" || type === "COMPLETE" || type === "CANCEL")) ||
      (session.status === "PAUSED" && (type === "RESUME" || type === "COMPLETE" || type === "CANCEL"));

    if (!valid) {
      return NextResponse.json(
        { error: `Cannot ${type} a ${session.status} session (timer state mismatch)` },
        { status: 409 }
      );
    }

    const now = new Date();
    const nextStatus =
      type === "PAUSE" ? "PAUSED" : type === "RESUME" ? "RUNNING" : type === "COMPLETE" ? "COMPLETED" : "CANCELLED";

    const updated = await db.pomodoroSession.update({
      where: { id: params.id },
      data: {
        status: nextStatus,
        ...(nextStatus === "COMPLETED" || nextStatus === "CANCELLED" ? { endedAt: now } : {}),
        events: { create: [{ type, timestamp: now }] },
      },
      include: {
        events: { orderBy: { timestamp: "asc" } },
        task: { select: { id: true, title: true } },
      },
    });
    return NextResponse.json({ session: updated }, { status: 201 });
  } catch (e) {
    console.error(`POST /api/sessions/${params.id}/events failed`, e);
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
}
