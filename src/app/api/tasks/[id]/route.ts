import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/current-user";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

async function ownedTask(userId: string, id: string) {
  return db.task.findFirst({
    where: { id, userId },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { events: { orderBy: { timestamp: "asc" } } },
      },
    },
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const task = await ownedTask(user.id, params.id);
    if (!task) return bad("Task not found", 404);
    return NextResponse.json({ task });
  } catch (e) {
    console.error(`GET /api/tasks/${params.id} failed`, e);
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const existing = await db.task.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
    if (!existing) return bad("Task not found", 404);

    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = typeof body.title === "string" ? body.title.trim() : "";
      if (!t) return bad("title cannot be empty");
      if (t.length > 200) return bad("title too long");
      data.title = t;
    }
    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" ? body.description.slice(0, 2000) : null;
    }
    if (body.allocatedMinutes !== undefined) {
      const v = Math.round(Number(body.allocatedMinutes));
      if (!Number.isFinite(v) || v < 1 || v > 1440) return bad("allocatedMinutes must be 1..1440");
      data.allocatedMinutes = v;
    }
    if (body.focusDuration !== undefined) {
      if (body.focusDuration === null) data.focusDuration = null;
      else {
        const v = Math.round(Number(body.focusDuration));
        if (!Number.isFinite(v) || v < 5 || v > 180) return bad("focusDuration must be 5..180");
        data.focusDuration = v;
      }
    }
    if (body.date !== undefined) {
      const d = parseDateOnly(body.date);
      if (!d) return bad("date must be YYYY-MM-DD");
      data.date = d;
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) return bad("invalid status");
      data.status = body.status;
    }
    if (body.calendarEventId !== undefined) {
      data.calendarEventId =
        typeof body.calendarEventId === "string" ? body.calendarEventId : null;
    }

    const task = await db.task.update({ where: { id: existing.id }, data: data as never });
    return NextResponse.json({ task });
  } catch (e) {
    console.error(`PATCH /api/tasks/${params.id} failed`, e);
    return NextResponse.json({ error: "Database unavailable or task not found." }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const existing = await db.task.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
    if (!existing) return bad("Task not found", 404);
    await db.task.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/tasks/${params.id} failed`, e);
    return NextResponse.json({ error: "Database unavailable or task not found." }, { status: 503 });
  }
}
