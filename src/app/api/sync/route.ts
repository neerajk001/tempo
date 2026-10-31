import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/current-user";
import { desktopCors } from "@/lib/cors";
import { db } from "@/lib/db";

/**
 * Bulk cloud sync for local-first multi-device use.
 *
 * POST /api/sync { tasks, sessions, deletedTaskIds, deletedSessionIds }
 *   Upserts client state (last-write-wins), applies tombstone deletes,
 *   dedupes calendar-linked tasks by calendarEventId, then returns the
 *   full server state for the client to merge.
 * GET /api/sync -> { tasks, sessions } (pull-only, sessions capped at 1000)
 *
 * Shapes mirror the client stores (see src/lib/sync.ts) so mapping lives
 * in exactly one place on each side.
 */

interface TaskPayload {
  id: string;
  title: string;
  description?: string | null;
  date?: string;
  allocatedMinutes?: number;
  focusMinutes?: number;
  shortBreakMinutes?: number | null;
  longBreakMinutes?: number | null;
  longBreakInterval?: number | null;
  project?: string | null;
  priority?: string;
  status?: string;
  focusedMinutes?: number;
  completedPomodoros?: number;
  subtasks?: Array<{ id: string; title: string; done: boolean; doneAt: number | null }>;
  calendarEventId?: string | null;
  startMs?: number | null;
  endMs?: number | null;
  createdAt?: number;
  updatedAt?: number;
  focusMode?: string;
  sessionName?: string | null;
  focusedMs?: number;
  breakMs?: number;
  interruptions?: number;
  completedFocusCount?: number;
  lastPhase?: string | null;
}

interface SettingsPayload {
  prefs?: unknown;
  pomodoro?: unknown;
  ambient?: unknown;
  diversions?: unknown;
  /** Client clock (ms). Drives last-write-wins across devices. */
  clientUpdatedAt?: number;
}

interface LivePayload {
  state?: unknown;
  /** Client clock (ms). Drives last-write-wins across devices. */
  clientUpdatedAt?: number;
}

interface SessionPayload {
  id: string;
  taskId?: string | null;
  taskTitle?: string | null;
  phase?: string;
  status?: string;
  plannedMs?: number;
  startedAt?: number;
  endedAt?: number;
  focusedMs?: number;
  pausedMs?: number;
  interruptions?: number;
  events?: Array<{ type: string; at: number }>;
  sessionMode?: string;
  sessionName?: string | null;
  breakMs?: number;
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

const msToInt = (v: unknown, fallback = 0): number =>
  Math.max(0, Math.round(num(v, fallback)));

function taskData(t: TaskPayload, userId: string) {
  const focusMode = t.focusMode === "infinite" ? "infinite" : "allocated";
  const focusedMinutes = Math.max(0, Math.round(num(t.focusedMinutes)));
  return {
    id: String(t.id),
    userId,
    title: String(t.title ?? "").slice(0, 200) || "Untitled",
    description: str(t.description),
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date ?? "") ? new Date(`${t.date}T00:00:00Z`) : new Date(),
    allocatedMinutes: focusMode === "infinite"
      ? Math.max(0, Math.round(num(t.allocatedMinutes, 0)))
      : Math.max(1, Math.round(num(t.allocatedMinutes, 60))),
    status: ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(t.status ?? "")
      ? (t.status as "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED")
      : ("TODO" as const),
    focusDuration: t.focusMinutes === undefined || t.focusMinutes === null ? null : Math.round(num(t.focusMinutes, 50)),
    shortBreak: t.shortBreakMinutes === undefined || t.shortBreakMinutes === null ? null : Math.round(num(t.shortBreakMinutes, 10)),
    longBreak: t.longBreakMinutes === undefined || t.longBreakMinutes === null ? null : Math.round(num(t.longBreakMinutes, 30)),
    longBreakInterval: t.longBreakInterval === undefined || t.longBreakInterval === null ? null : Math.round(num(t.longBreakInterval, 4)),
    project: str(t.project)?.slice(0, 60) ?? null,
    priority: ["urgent", "high", "medium", "low"].includes(t.priority ?? "") ? String(t.priority) : "medium",
    focusedMinutes,
    completedPomodoros: Math.max(0, Math.round(num(t.completedPomodoros))),
    subtasks: Array.isArray(t.subtasks) ? t.subtasks.slice(0, 200) : [],
    calendarEventId: str(t.calendarEventId),
    startMs: t.startMs === undefined || t.startMs === null ? null : BigInt(Math.round(num(t.startMs))),
    endMs: t.endMs === undefined || t.endMs === null ? null : BigInt(Math.round(num(t.endMs))),
    focusMode,
    sessionName: str(t.sessionName)?.slice(0, 200) ?? null,
    focusedMs: Math.max(0, Math.round(num(t.focusedMs, focusedMinutes * 60000))),
    breakMs: Math.max(0, Math.round(num(t.breakMs))),
    interruptions: Math.max(0, Math.round(num(t.interruptions))),
    completedFocusCount: Math.max(0, Math.round(num(t.completedFocusCount, num(t.completedPomodoros)))),
    lastPhase: ["FOCUS", "SHORT_BREAK", "LONG_BREAK"].includes(t.lastPhase ?? "") ? String(t.lastPhase) : null,
  };
}

function sessionData(s: SessionPayload, userId: string) {
  const sessionMode = s.sessionMode === "infinite" ? "infinite" : "allocated";
  return {
    id: String(s.id),
    userId,
    taskId: str(s.taskId),
    taskTitle: str(s.taskTitle),
    type: ["FOCUS", "SHORT_BREAK", "LONG_BREAK"].includes(s.phase ?? "")
      ? (s.phase as "FOCUS" | "SHORT_BREAK" | "LONG_BREAK")
      : ("FOCUS" as const),
    status: s.status === "CANCELLED" ? ("CANCELLED" as const) : ("COMPLETED" as const),
    plannedMinutes: sessionMode === "infinite" ? 0 : Math.max(1, Math.round(num(s.plannedMs, 50 * 60000) / 60000)),
    startedAt: new Date(msToInt(s.startedAt, Date.now())),
    endedAt: new Date(msToInt(s.endedAt, Date.now())),
    focusedMs: msToInt(s.focusedMs),
    pausedMs: msToInt(s.pausedMs),
    interruptions: Math.max(0, Math.round(num(s.interruptions))),
    sessionMode,
    sessionName: str(s.sessionName)?.slice(0, 200) ?? null,
    breakMs: msToInt(s.breakMs),
    events: Array.isArray(s.events)
      ? s.events
          .filter((e) => ["START", "PAUSE", "RESUME", "COMPLETE", "CANCEL"].includes(e?.type))
          .slice(0, 100)
          .map((e) => ({
            type: e.type as "START" | "PAUSE" | "RESUME" | "COMPLETE" | "CANCEL",
            timestamp: new Date(msToInt(e.at, Date.now())),
          }))
      : [],
  };
}

function toClientTask(t: any) {
  return {
    id: t.id as string,
    title: t.title as string,
    description: (t.description as string | null) ?? "",
    date: (t.date as Date).toISOString().slice(0, 10),
    allocatedMinutes: t.allocatedMinutes as number,
    focusMinutes: (t.focusDuration as number | null) ?? 50,
    shortBreakMinutes: t.shortBreak as number | null,
    longBreakMinutes: t.longBreak as number | null,
    longBreakInterval: (t.longBreakInterval as number | null) ?? 4,
    project: t.project as string | null,
    priority: t.priority as string,
    status: t.status as string,
    focusedMinutes: t.focusedMinutes as number,
    completedPomodoros: t.completedPomodoros as number,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    calendarEventId: (t.calendarEventId as string | null) ?? null,
    startMs: t.startMs === null || t.startMs === undefined ? null : Number(t.startMs),
    endMs: t.endMs === null || t.endMs === undefined ? null : Number(t.endMs),
    createdAt: (t.createdAt as Date).getTime(),
    updatedAt: (t.updatedAt as Date).getTime(),
    focusMode: (t.focusMode as string | undefined) ?? "allocated",
    sessionName: (t.sessionName as string | null) ?? null,
    focusedMs: (t.focusedMs as number | undefined) ?? (t.focusedMinutes as number) * 60000,
    breakMs: (t.breakMs as number | undefined) ?? 0,
    interruptions: (t.interruptions as number | undefined) ?? 0,
    completedFocusCount: (t.completedFocusCount as number | undefined) ?? (t.completedPomodoros as number),
    lastPhase: (t.lastPhase as string | null) ?? null,
  };
}

function toClientSession(s: any) {
  return {
    id: s.id as string,
    taskId: (s.taskId as string | null) ?? null,
    taskTitle: (s.taskTitle as string | null) ?? null,
    phase: s.type as string,
    status: s.status as string,
    plannedMs: (s.plannedMinutes as number) * 60000,
    startedAt: (s.startedAt as Date).getTime(),
    endedAt: (s.endedAt as Date).getTime(),
    focusedMs: s.focusedMs as number,
    pausedMs: s.pausedMs as number,
    interruptions: s.interruptions as number,
    sessionMode: (s.sessionMode as string | undefined) ?? "allocated",
    sessionName: (s.sessionName as string | null) ?? null,
    breakMs: (s.breakMs as number | undefined) ?? 0,
    events: Array.isArray(s.events)
      ? (s.events as any[]).map((e) => ({
          type: e.type as string,
          at: (e.timestamp as Date).getTime(),
        }))
      : [],
  };
}

function toClientSettings(s: any) {
  return {
    prefs: (s.prefs as unknown) ?? {},
    pomodoro: (s.pomodoro as unknown) ?? {},
    ambient: (s.ambient as unknown) ?? {},
    diversions: Array.isArray(s.diversions) ? s.diversions : [],
    updatedAt: Number(s.clientUpdatedAt ?? 0),
  };
}

async function serverState(userId: string) {
  const [tasks, sessions, settings, live] = await Promise.all([
    db.task.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 2000 }),
    db.pomodoroSession.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 1000,
      include: { events: { orderBy: { timestamp: "asc" } } },
    }),
    db.userSettings.findUnique({ where: { userId } }),
    db.userLiveSession.findUnique({ where: { userId } }),
  ]);
  return {
    tasks: tasks.map(toClientTask),
    sessions: sessions.map(toClientSession),
    settings: settings ? toClientSettings(settings) : null,
    live: live
      ? {
          state: (live.state as unknown) ?? {},
          updatedAt: Number(live.clientUpdatedAt ?? 0),
        }
      : null,
  };
}

function respond(req: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: desktopCors(req) });
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: desktopCors(req) });
}

export async function GET(req: Request) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return respond(req, { error: "Sign in to access your data.", needsAuth: true }, 401);
  try {
    return respond(req, await serverState(user.id));
  } catch (e) {
    console.error("GET /api/sync failed", e);
    return respond(req, { error: "Sync unavailable." }, 500);
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return respond(req, { error: "Sign in to access your data.", needsAuth: true }, 401);
  let body: {
    tasks?: TaskPayload[];
    sessions?: SessionPayload[];
    settings?: SettingsPayload;
    live?: LivePayload;
    deletedTaskIds?: string[];
    deletedSessionIds?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return respond(req, { error: "Invalid JSON." }, 400);
  }
  const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 2000) : [];
  const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 1000) : [];
  const deletedTaskIds = Array.isArray(body.deletedTaskIds)
    ? body.deletedTaskIds.filter((x) => typeof x === "string").slice(0, 2000)
    : [];
  const deletedSessionIds = Array.isArray(body.deletedSessionIds)
    ? body.deletedSessionIds.filter((x) => typeof x === "string").slice(0, 2000)
    : [];

  try {
    // Tombstone deletes first so resurrections can't win the merge below.
    if (deletedTaskIds.length > 0) {
      await db.task.deleteMany({ where: { userId: user.id, id: { in: deletedTaskIds } } });
    }
    if (deletedSessionIds.length > 0) {
      await db.pomodoroSession.deleteMany({ where: { userId: user.id, id: { in: deletedSessionIds } } });
    }

    // Batched upsert (avoids N+1): one read, then batched writes.
    const incomingTaskIds = tasks
      .filter((t) => t && typeof t.id === "string" && t.id)
      .map((t) => String((t as TaskPayload).id));
    const existingTasks =
      incomingTaskIds.length > 0
        ? await db.task.findMany({
            where: { id: { in: incomingTaskIds }, userId: user.id },
            select: { id: true, updatedAt: true },
          })
        : [];
    const existingTaskMap = new Map(existingTasks.map((t) => [t.id, t.updatedAt.getTime()]));
    const taskWrites: any[] = [];
    for (const raw of tasks) {
      if (!raw || typeof raw.id !== "string" || !raw.id) continue;
      const data = taskData(raw, user.id);
      const incomingUpdatedAt = num(raw.updatedAt, 0);
      const existingTime = existingTaskMap.get(data.id);
      if (existingTime !== undefined && existingTime > incomingUpdatedAt) continue;
      if (existingTime !== undefined) {
        const { id, userId, ...rest } = data;
        taskWrites.push(
          db.task.updateMany({ where: { id: data.id, userId: user.id }, data: rest as never })
        );
      } else {
        taskWrites.push(db.task.create({ data: data as never }));
      }
    }
    // Chunked transaction to avoid oversized payloads.
    for (let i = 0; i < taskWrites.length; i += 100) {
      const chunk = taskWrites.slice(i, i + 100);
      if (chunk.length === 1) await chunk[0];
      else if (chunk.length > 1) await db.$transaction(chunk);
    }

    // One external event links to exactly one task: drop server rows the
    // client already replaced.
    const incomingIds = incomingTaskIds;
    const eventIds = Array.from(
      new Set(
        tasks.map((t) => str(t.calendarEventId)).filter((x): x is string => !!x)
      )
    );
    if (eventIds.length > 0) {
      await db.task.deleteMany({
        where: { userId: user.id, calendarEventId: { in: eventIds }, id: { notIn: incomingIds } },
      });
    }

    // Validate session->task links: attacker must not link to another user's task.
    const referencedTaskIds = Array.from(
      new Set(
        sessions
          .map((s) => str(s.taskId))
          .filter((x): x is string => !!x)
          .slice(0, 1000)
      )
    );
    const ownedTasks =
      referencedTaskIds.length > 0
        ? await db.task.findMany({
            where: { id: { in: referencedTaskIds }, userId: user.id },
            select: { id: true },
          })
        : [];
    const ownedTaskIds = new Set([
      ...ownedTasks.map((t) => t.id),
      ...incomingTaskIds,
    ]);

    const incomingSessionIds = sessions
      .filter((s) => s && typeof s.id === "string" && s.id)
      .map((s) => String((s as SessionPayload).id));
    const existingSessions =
      incomingSessionIds.length > 0
        ? await db.pomodoroSession.findMany({
            where: { id: { in: incomingSessionIds }, userId: user.id },
            select: { id: true, endedAt: true },
          })
        : [];
    const existingSessionMap = new Map(
      existingSessions.map((s) => [s.id, s.endedAt?.getTime() ?? 0])
    );
    // Sequential writes for sessions (events need delete-then-create).
    // Still avoids N+1 reads by pre-fetching above.
    for (const raw of sessions) {
      if (!raw || typeof raw.id !== "string" || !raw.id) continue;
      const data = sessionData(raw, user.id);
      if (data.taskId && !ownedTaskIds.has(data.taskId)) {
        data.taskId = null;
      }
      const existingTime = existingSessionMap.get(data.id);
      if (existingTime !== undefined && existingTime > data.endedAt.getTime()) continue;
      if (existingTime !== undefined) {
        await db.sessionEvent.deleteMany({ where: { sessionId: data.id } });
        await db.pomodoroSession.updateMany({
          where: { id: data.id, userId: user.id },
          data: {
            taskId: data.taskId,
            taskTitle: data.taskTitle,
            type: data.type,
            status: data.status,
            plannedMinutes: data.plannedMinutes,
            startedAt: data.startedAt,
            endedAt: data.endedAt,
            focusedMs: data.focusedMs,
            pausedMs: data.pausedMs,
            interruptions: data.interruptions,
            sessionMode: data.sessionMode,
            sessionName: data.sessionName,
            breakMs: data.breakMs,
            events: { create: data.events },
          } as never,
        });
      } else {
        await db.pomodoroSession.create({
          data: {
            id: data.id,
            userId: data.userId,
            taskId: data.taskId,
            taskTitle: data.taskTitle,
            type: data.type,
            status: data.status,
            plannedMinutes: data.plannedMinutes,
            startedAt: data.startedAt,
            endedAt: data.endedAt,
            focusedMs: data.focusedMs,
            pausedMs: data.pausedMs,
            interruptions: data.interruptions,
            sessionMode: data.sessionMode,
            sessionName: data.sessionName,
            breakMs: data.breakMs,
            events: { create: data.events },
          } as never,
        });
      }
    }

    // Settings: one row per user, last-write-wins on the client timestamp.
    const rawSettings = body.settings;
    if (rawSettings && typeof rawSettings === "object") {
      const asObject = (v: unknown) =>
        v && typeof v === "object" && !Array.isArray(v) ? v : {};
      const clientUpdatedAt = BigInt(
        Math.max(0, Math.round(num(rawSettings.clientUpdatedAt, 0)))
      );
      const data = {
        prefs: asObject(rawSettings.prefs),
        pomodoro: asObject(rawSettings.pomodoro),
        ambient: asObject(rawSettings.ambient),
        diversions: Array.isArray(rawSettings.diversions)
          ? rawSettings.diversions.slice(0, 200)
          : [],
        clientUpdatedAt,
      };
      const existing = await db.userSettings.findUnique({
        where: { userId: user.id },
        select: { clientUpdatedAt: true },
      });
      if (!existing) {
        await db.userSettings.create({ data: { userId: user.id, ...data } as never });
      } else if (clientUpdatedAt > existing.clientUpdatedAt) {
        await db.userSettings.update({ where: { userId: user.id }, data: data as never });
      }
    }

    // Live timer state: one row per user, last-write-wins on client timestamp.
    const rawLive = body.live;
    if (rawLive && typeof rawLive === "object") {
      const clientUpdatedAt = BigInt(
        Math.max(0, Math.round(num(rawLive.clientUpdatedAt, 0)))
      );
      const state =
        rawLive.state && typeof rawLive.state === "object" && !Array.isArray(rawLive.state)
          ? rawLive.state
          : {};
      const existing = await db.userLiveSession.findUnique({
        where: { userId: user.id },
        select: { clientUpdatedAt: true },
      });
      if (!existing) {
        await db.userLiveSession.create({
          data: { userId: user.id, state, clientUpdatedAt } as never,
        });
      } else if (clientUpdatedAt > existing.clientUpdatedAt) {
        await db.userLiveSession.update({
          where: { userId: user.id },
          data: { state, clientUpdatedAt } as never,
        });
      }
    }

    return respond(req, await serverState(user.id));
  } catch (e) {
    console.error("POST /api/sync failed", e);
    return respond(req, { error: "Sync unavailable." }, 500);
  }
}
