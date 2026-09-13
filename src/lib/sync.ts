"use client";

/**
 * Local-first cloud sync engine.
 *
 * The UI always reads local zustand stores (instant + offline). In the
 * background, when signed in and online, this module pushes local state to
 * POST /api/sync and merges the server state back:
 * - Tasks: union by id, last-write-wins on updatedAt, deduped by
 *   calendarEventId (one event links to exactly one task).
 * - Sessions: append-only union by id (immutable once logged).
 * - Settings: prefs, Pomodoro cadence, ambient selection and diversions,
 *   last-write-wins on a client timestamp (see settings-sync.ts).
 * - Live timer: the in-progress/paused session + active task pointer, so a run
 *   continues on another device at the same elapsed time (see live-sync.ts).
 * - Deletes ride along as tombstones (see tombstones.ts) so a pull can
 *   never resurrect a deleted record.
 * Scratchpads stay per-device.
 */

import { useTaskStore, type Task } from "@/stores/task-store";
import { useSessionHistoryStore, type SessionRecord } from "@/stores/session-history-store";
import { useSyncStore } from "@/stores/sync-store";
import {
  loadTombstones,
  pruneTombstones,
  addTaskTombstones,
  addSessionTombstones,
} from "@/lib/tombstones";
import {
  collectLocalSettings,
  applyRemoteSettings,
  normalizeRemoteSettings,
  shouldApplySettings,
  initSettingsSync,
} from "@/lib/settings-sync";
import {
  collectLiveState,
  applyRemoteLive,
  normalizeRemoteLive,
  shouldApplyLive,
  initLiveSync,
} from "@/lib/live-sync";
import { loadGuestMeta, clearGuestMeta } from "@/lib/guest";
import { todayKey } from "@/lib/task-planning";
import type { PomodoroPhase, SessionEventType, TaskPriority, TaskStatus } from "@/types";

const PUSH_DEBOUNCE_MS = 2500;
const AUTO_THROTTLE_MS = 30000;
const SESSION_CAP = 500;

let authed = false;
let pendingPush = false;
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastAutoAt = 0;
let subscribed = false;

// ---------------------------------------------------------------------------
// Normalization (loose server JSON -> store shapes)
// ---------------------------------------------------------------------------

interface LooseSubtask {
  id?: unknown;
  title?: unknown;
  done?: unknown;
  doneAt?: unknown;
}

interface LooseEvent {
  type?: unknown;
  at?: unknown;
}

function asTaskPriority(v: unknown): TaskPriority {
  return v === "urgent" || v === "high" || v === "medium" || v === "low" ? v : "medium";
}

function asTaskStatus(v: unknown): TaskStatus {
  return v === "TODO" || v === "IN_PROGRESS" || v === "COMPLETED" || v === "CANCELLED"
    ? v
    : "TODO";
}

function asPhase(v: unknown): PomodoroPhase {
  return v === "FOCUS" || v === "SHORT_BREAK" || v === "LONG_BREAK" ? v : "FOCUS";
}

export function normalizeRemoteTask(r: any): Task | null {
  if (!r || typeof r.id !== "string" || !r.id) return null;
  const num = (v: unknown, fb: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fb;
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : todayKey();
  const focusMode = r.focusMode === "infinite" ? ("infinite" as const) : ("allocated" as const);
  const focusedMinutes = Math.max(0, Math.round(num(r.focusedMinutes, 0)));
  return {
    id: r.id,
    title: typeof r.title === "string" && r.title ? r.title.slice(0, 200) : "Untitled",
    description: typeof r.description === "string" ? r.description.slice(0, 2000) : "",
    date,
    allocatedMinutes: focusMode === "infinite"
      ? Math.max(0, Math.round(num(r.allocatedMinutes, 0)))
      : Math.max(1, Math.round(num(r.allocatedMinutes, 60))),
    focusMinutes: Math.min(180, Math.max(5, Math.round(num(r.focusMinutes, 50)))),
    shortBreakMinutes: r.shortBreakMinutes === null || r.shortBreakMinutes === undefined ? null : Math.round(num(r.shortBreakMinutes, 10)),
    longBreakMinutes: r.longBreakMinutes === null || r.longBreakMinutes === undefined ? null : Math.round(num(r.longBreakMinutes, 30)),
    longBreakInterval: r.longBreakInterval === null || r.longBreakInterval === undefined ? null : Math.round(num(r.longBreakInterval, 4)),
    status: asTaskStatus(r.status),
    focusedMinutes,
    completedPomodoros: Math.max(0, Math.round(num(r.completedPomodoros, 0))),
    project: typeof r.project === "string" && r.project ? r.project.slice(0, 60) : null,
    priority: asTaskPriority(r.priority),
    subtasks: Array.isArray(r.subtasks)
      ? (r.subtasks as LooseSubtask[])
          .filter((s) => s && typeof s.id === "string" && typeof s.title === "string")
          .slice(0, 200)
          .map((s) => ({
            id: String(s.id),
            title: String(s.title).slice(0, 120),
            done: s.done === true,
            doneAt: typeof s.doneAt === "number" ? s.doneAt : null,
          }))
      : [],
    calendarEventId: typeof r.calendarEventId === "string" ? r.calendarEventId : null,
    startMs: typeof r.startMs === "number" ? r.startMs : null,
    endMs: typeof r.endMs === "number" ? r.endMs : null,
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
    focusMode,
    sessionName: typeof r.sessionName === "string" && r.sessionName.trim() ? r.sessionName.trim().slice(0, 200) : null,
    focusedMs: Math.max(0, Math.round(num(r.focusedMs, focusedMinutes * 60000))),
    breakMs: Math.max(0, Math.round(num(r.breakMs, 0))),
    interruptions: Math.max(0, Math.round(num(r.interruptions, 0))),
    completedFocusCount: Math.max(0, Math.round(num(r.completedFocusCount, num(r.completedPomodoros, 0)))),
    lastPhase: r.lastPhase === "SHORT_BREAK" || r.lastPhase === "LONG_BREAK" || r.lastPhase === "FOCUS" ? r.lastPhase : null,
  };
}

export function normalizeRemoteSession(r: any): SessionRecord | null {
  if (!r || typeof r.id !== "string" || !r.id) return null;
  const num = (v: unknown, fb: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fb;
  return {
    id: r.id,
    taskId: typeof r.taskId === "string" ? r.taskId : null,
    taskTitle: typeof r.taskTitle === "string" ? r.taskTitle : null,
    phase: asPhase(r.phase),
    status: r.status === "CANCELLED" ? "CANCELLED" : "COMPLETED",
    // Infinite sessions are open-ended (plannedMs 0 = no plan).
    plannedMs: r.sessionMode === "infinite" ? Math.max(0, Math.round(num(r.plannedMs, 0))) : Math.max(1, Math.round(num(r.plannedMs, 50 * 60000))),
    startedAt: Math.round(num(r.startedAt, Date.now())),
    endedAt: Math.round(num(r.endedAt, Date.now())),
    focusedMs: Math.max(0, Math.round(num(r.focusedMs, 0))),
    pausedMs: Math.max(0, Math.round(num(r.pausedMs, 0))),
    interruptions: Math.max(0, Math.round(num(r.interruptions, 0))),
    sessionMode: r.sessionMode === "infinite" ? ("infinite" as const) : ("allocated" as const),
    sessionName: typeof r.sessionName === "string" && r.sessionName.trim() ? r.sessionName.trim().slice(0, 200) : null,
    breakMs: Math.max(0, Math.round(num(r.breakMs, 0))),
    events: Array.isArray(r.events)
      ? (r.events as LooseEvent[])
          .filter((e) => e && typeof e.at === "number")
          .slice(0, 100)
          .map((e) => ({
            type: (["START", "PAUSE", "RESUME", "COMPLETE", "CANCEL"].includes(
              typeof e.type === "string" ? e.type : ""
            )
              ? e.type
              : "START") as SessionEventType,
            at: Math.round(typeof e.at === "number" ? e.at : 0),
          }))
      : [],
  };
}

// ---------------------------------------------------------------------------
// Pure merge (unit-tested)
// ---------------------------------------------------------------------------

export function mergeTasks(
  local: Task[],
  remote: Task[],
  tombstonedIds: Set<string>
): { tasks: Task[]; dropRemoteIds: string[] } {
  const dropRemoteIds: string[] = [];
  const byId = new Map<string, Task>();
  for (const t of local) {
    if (!tombstonedIds.has(t.id)) byId.set(t.id, t);
  }
  for (const t of remote) {
    if (tombstonedIds.has(t.id)) {
      dropRemoteIds.push(t.id);
      continue;
    }
    const cur = byId.get(t.id);
    if (!cur) byId.set(t.id, t);
    else if (t.updatedAt > cur.updatedAt) byId.set(t.id, t);
  }
  // One calendar event links to exactly one task: collapse duplicates by
  // event, keeping the earliest-created (local wins ties).
  const localIds = new Set(local.map((t) => t.id));
  const byEvent = new Map<string, Task[]>();
  byId.forEach((t) => {
    if (!t.calendarEventId) return;
    const list = byEvent.get(t.calendarEventId) ?? [];
    list.push(t);
    byEvent.set(t.calendarEventId, list);
  });
  byEvent.forEach((list) => {
    if (list.length < 2) return;
    list.sort(
      (a: Task, b: Task) =>
        a.createdAt - b.createdAt ||
        (localIds.has(a.id) ? 0 : 1) - (localIds.has(b.id) ? 0 : 1) ||
        (a.id < b.id ? -1 : 1)
    );
    list.slice(1).forEach((dupe) => {
      byId.delete(dupe.id);
      if (!localIds.has(dupe.id)) dropRemoteIds.push(dupe.id);
      else addTaskTombstones([dupe.id]);
    });
  });
  const tasks = Array.from(byId.values()).sort(
    (a: Task, b: Task) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)
  );
  return { tasks, dropRemoteIds: Array.from(new Set(dropRemoteIds)) };
}

export function mergeSessions(
  local: SessionRecord[],
  remote: SessionRecord[],
  tombstonedIds: Set<string>,
  cap = SESSION_CAP
): { sessions: SessionRecord[]; dropRemoteIds: string[] } {
  const dropRemoteIds: string[] = [];
  const byId = new Map<string, SessionRecord>();
  for (const s of local) {
    if (!s.id || tombstonedIds.has(s.id)) continue;
    byId.set(s.id, s);
  }
  for (const s of remote) {
    if (!s.id) continue;
    if (tombstonedIds.has(s.id)) {
      dropRemoteIds.push(s.id);
      continue;
    }
    const cur = byId.get(s.id);
    if (!cur) byId.set(s.id, s);
    else if (s.endedAt > cur.endedAt) byId.set(s.id, s);
  }
  const sessions = Array.from(byId.values())
    .sort((a: SessionRecord, b: SessionRecord) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1))
    .slice(0, cap);
  return { sessions, dropRemoteIds: Array.from(new Set(dropRemoteIds)) };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function setSyncAuthed(v: boolean): void {
  authed = v;
  if (v && pendingPush) {
    pendingPush = false;
    void syncNow();
  }
}

export function schedulePush(): void {
  if (applyingRemote) return;
  if (!authed) {
    pendingPush = true;
    return;
  }
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void syncNow();
  }, PUSH_DEBOUNCE_MS);
}

interface RemoteState {
  tasks?: unknown[];
  sessions?: unknown[];
  settings?: unknown;
  live?: unknown;
}

function reconcile(
  remote: RemoteState,
  pushed: { taskIds: string[]; sessionIds: string[] } | null
): boolean {
  const tombs = loadTombstones();
  const localTasks = useTaskStore.getState().tasks;
  const localSessions = useSessionHistoryStore.getState().sessions;
  const remoteTasks = Array.isArray(remote.tasks)
    ? remote.tasks.map(normalizeRemoteTask).filter((t): t is Task => !!t)
    : [];
  const remoteSessions = Array.isArray(remote.sessions)
    ? remote.sessions.map(normalizeRemoteSession).filter((s): s is SessionRecord => !!s)
    : [];

  const mergedTasks = mergeTasks(localTasks, remoteTasks, new Set(Object.keys(tombs.tasks)));
  const mergedSessions = mergeSessions(localSessions, remoteSessions, new Set(Object.keys(tombs.sessions)));

  applyingRemote = true;
  try {
    useTaskStore.setState({ tasks: mergedTasks.tasks });
    useSessionHistoryStore.setState({ sessions: mergedSessions.sessions });
  } finally {
    applyingRemote = false;
  }

  // Settings are a single last-write-wins blob: only adopt the server copy
  // when it is newer than what this device last pushed.
  const remoteSettings = normalizeRemoteSettings(remote.settings);
  if (remoteSettings && shouldApplySettings(collectLocalSettings(), remoteSettings)) {
    applyRemoteSettings(remoteSettings);
  }

  // Live timer state is likewise last-write-wins, tracked separately.
  const remoteLive = normalizeRemoteLive(remote.live);
  if (remoteLive && shouldApplyLive(collectLiveState(), remoteLive)) {
    applyRemoteLive(remoteLive);
  }

  // Server confirmed our tombstones on POST — prune them. Anything we
  // dropped from the remote side gets tombstoned for the next push.
  if (pushed) pruneTombstones(pushed.taskIds, pushed.sessionIds);
  const dropTasks = mergedTasks.dropRemoteIds;
  const dropSessions = mergedSessions.dropRemoteIds;
  if (dropTasks.length > 0) addTaskTombstones(dropTasks);
  if (dropSessions.length > 0) addSessionTombstones(dropSessions);
  return dropTasks.length > 0 || dropSessions.length > 0;
}

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Full cycle: push local state, merge the server state back. */
export async function syncNow(authedOverride?: boolean): Promise<boolean> {
  const ok = authedOverride ?? authed;
  if (!ok || !online()) return false;
  if (useSyncStore.getState().syncing) return false;
  useSyncStore.getState().setSyncing(true);
  try {
    const tombs = loadTombstones();
    const taskIds = Object.keys(tombs.tasks);
    const sessionIds = Object.keys(tombs.sessions);
    const live = collectLiveState();
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tasks: useTaskStore.getState().tasks,
        sessions: useSessionHistoryStore.getState().sessions,
        settings: collectLocalSettings(),
        live: { state: live, clientUpdatedAt: live.updatedAt },
        deletedTaskIds: taskIds,
        deletedSessionIds: sessionIds,
      }),
    });
    if (res.status === 401) {
      useSyncStore.getState().setResult(false, "Sign in to sync.");
      return false;
    }
    if (!res.ok) throw new Error(`Sync failed (${res.status}).`);
    const remote = (await res.json()) as RemoteState;
    const needsFlush = reconcile(remote, { taskIds, sessionIds });
    // Local data is now account-owned: the guest inactivity TTL no longer
    // applies on this device.
    if (ok) clearGuestMeta();
    useSyncStore.getState().setResult(true);
    if (needsFlush) schedulePush();
    return true;
  } catch (e) {
    useSyncStore.getState().setResult(false, e instanceof Error ? e.message : "Sync failed.");
    return false;
  }
}

/** Pull-only cycle (no local changes to push). */
export async function pullNow(authedOverride?: boolean): Promise<boolean> {
  const ok = authedOverride ?? authed;
  if (!ok || !online()) return false;
  if (useSyncStore.getState().syncing) return false;
  useSyncStore.getState().setSyncing(true);
  try {
    const res = await fetch("/api/sync");
    if (res.status === 401) {
      useSyncStore.getState().setResult(false, "Sign in to sync.");
      return false;
    }
    if (!res.ok) throw new Error(`Sync failed (${res.status}).`);
    const remote = (await res.json()) as RemoteState;
    const needsFlush = reconcile(remote, null);
    useSyncStore.getState().setResult(true);
    if (needsFlush) schedulePush();
    return true;
  } catch (e) {
    useSyncStore.getState().setResult(false, e instanceof Error ? e.message : "Sync failed.");
    return false;
  }
}

/** Throttled entry for background triggers (focus/interval). */
export function maybeAutoSync(): void {
  const now = Date.now();
  if (now - lastAutoAt < AUTO_THROTTLE_MS) return;
  lastAutoAt = now;
  void syncNow();
}

/**
 * Guest -> account migration. Pushes all local data (tasks, sessions and
 * settings) and merges the server state back, then drops the guest TTL marker
 * on success inside syncNow. Idempotent: re-running repeats the same
 * last-write-wins merge and converges. Returns true when a migration ran.
 */
export async function migrateGuestToAccount(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const hasGuestData = loadGuestMeta() !== null;
  const ok = await syncNow(true);
  return ok && hasGuestData;
}

/** Subscribe stores for push-on-mutation. Idempotent; call once from SyncManager. */
export function initSync(): void {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  useTaskStore.subscribe(() => schedulePush());
  useSessionHistoryStore.subscribe(() => schedulePush());
  initSettingsSync(() => schedulePush());
  initLiveSync(() => schedulePush());
}
