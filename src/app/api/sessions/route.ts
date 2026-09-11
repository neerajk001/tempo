import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/current-user";
import {
  calculateFocusDuration,
  calculateInterruptions,
  calculatePausedDuration,
} from "@/lib/session-analytics";

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Day bounds in UTC; day-filtering precision is adequate pre-timezone phase.
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function withAnalytics(session: {
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

// GET /api/sessions?date=YYYY-MM-DD&taskId=&limit=100 (current user only)
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const taskId = url.searchParams.get("taskId");
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));

    const where: Record<string, unknown> = { userId: user.id };
    if (taskId) where.taskId = taskId;
    if (dateParam) {
      const day = parseDateOnly(dateParam);
      if (!day) {
        return NextResponse.json({ error: "Invalid ?date=, expected YYYY-MM-DD" }, { status: 400 });
      }
      const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      where.startedAt = { gte: day, lt: next };
    }

    const sessions = await db.pomodoroSession.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        task: { select: { id: true, title: true } },
        events: { orderBy: { timestamp: "asc" } },
      },
    });
    return NextResponse.json({
      sessions: sessions.map((s) => ({ ...s, analytics: withAnalytics(s) })),
    });
  } catch (e) {
    console.error("GET /api/sessions failed", e);
    return NextResponse.json(
      { error: "Database unavailable. Set DATABASE_URL and run db:push." },
      { status: 503 }
    );
  }
}

// POST /api/sessions { taskId?, type?, plannedMinutes? } -> RUNNING + START
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const body = (await req.json()) as Record<string, unknown>;
    const type = body.type === undefined ? "FOCUS" : body.type;
    if (!["FOCUS", "SHORT_BREAK", "LONG_BREAK"].includes(type as string)) {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }
    const plannedMinutes =
      body.plannedMinutes === undefined ? 50 : Math.round(Number(body.plannedMinutes));
    if (!Number.isFinite(plannedMinutes) || plannedMinutes < 1 || plannedMinutes > 240) {
      return NextResponse.json({ error: "plannedMinutes must be 1..240" }, { status: 400 });
    }
    const taskId = typeof body.taskId === "string" && body.taskId ? body.taskId : undefined;
    if (taskId) {
      // Ownership check: only link tasks belonging to the current user.
      const task = await db.task.findFirst({ where: { id: taskId, userId: user.id }, select: { id: true } });
      if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    }

    const now = new Date();
    const session = await db.pomodoroSession.create({
      data: {
        userId: user.id,
        taskId,
        type: type as "FOCUS" | "SHORT_BREAK" | "LONG_BREAK",
        status: "RUNNING",
        plannedMinutes,
        startedAt: now,
        events: { create: [{ type: "START", timestamp: now }] },
      },
      include: { events: { orderBy: { timestamp: "asc" } }, task: { select: { id: true, title: true } } },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (e) {
    console.error("POST /api/sessions failed", e);
    return NextResponse.json(
      { error: "Database unavailable. Set DATABASE_URL and run db:push." },
      { status: 503 }
    );
  }
}
