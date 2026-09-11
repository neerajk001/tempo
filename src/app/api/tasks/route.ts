import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/current-user";
import { Prisma } from "@prisma/client";

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// GET /api/tasks?date=YYYY-MM-DD — current user's tasks with session linkage + progress
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const where: Prisma.TaskWhereInput = { userId: user.id };
    if (dateParam) {
      const d = parseDateOnly(dateParam);
      if (!d) return bad("Invalid ?date=, expected YYYY-MM-DD");
      where.date = d;
    }
    const tasks = await db.task.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        sessions: {
          select: { id: true, status: true, plannedMinutes: true, startedAt: true, endedAt: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });
    const withProgress = tasks.map((t) => {
      const totalSessions = t.sessions.length;
      const completedSessions = t.sessions.filter((s) => s.status === "COMPLETED").length;
      // Approximation until Phase 04 event analytics: sum planned minutes of completed sessions.
      const focusedMinutes = t.sessions
        .filter((s) => s.status === "COMPLETED")
        .reduce((sum, s) => sum + s.plannedMinutes, 0);
      return {
        ...t,
        progress: {
          totalSessions,
          completedSessions,
          focusedMinutes,
          remainingMinutes: Math.max(0, t.allocatedMinutes - focusedMinutes),
        },
      };
    });
    return NextResponse.json({ tasks: withProgress });
  } catch (e) {
    console.error("GET /api/tasks failed", e);
    return NextResponse.json(
      { error: "Database unavailable. Set DATABASE_URL and run db:push." },
      { status: 503 }
    );
  }
}

// POST /api/tasks — create for the current user
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const body = (await req.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return bad("title is required");
    if (title.length > 200) return bad("title too long (max 200)");

    const allocatedMinutes =
      typeof body.allocatedMinutes === "number" ? Math.round(body.allocatedMinutes) : NaN;
    if (!Number.isFinite(allocatedMinutes) || allocatedMinutes < 1 || allocatedMinutes > 1440) {
      return bad("allocatedMinutes must be 1..1440");
    }
    const focusDuration =
      body.focusDuration === undefined || body.focusDuration === null
        ? undefined
        : Math.round(Number(body.focusDuration));
    if (
      focusDuration !== undefined &&
      (!Number.isFinite(focusDuration) || focusDuration < 5 || focusDuration > 180)
    ) {
      return bad("focusDuration must be 5..180");
    }
    const date = body.date === undefined ? new Date() : parseDateOnly(body.date);
    if (body.date !== undefined && !date) return bad("date must be YYYY-MM-DD");

    const status = body.status === undefined ? "TODO" : body.status;
    if (!["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(status as string)) {
      return bad("invalid status");
    }

    const task = await db.task.create({
      data: {
        userId: user.id,
        title,
        description:
          typeof body.description === "string" ? body.description.slice(0, 2000) : null,
        date: date ?? new Date(),
        allocatedMinutes,
        focusDuration: focusDuration ?? undefined,
        status: status as "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
        calendarEventId:
          typeof body.calendarEventId === "string" ? body.calendarEventId : undefined,
      },
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    console.error("POST /api/tasks failed", e);
    return NextResponse.json(
      { error: "Database unavailable. Set DATABASE_URL and run db:push." },
      { status: 503 }
    );
  }
}
