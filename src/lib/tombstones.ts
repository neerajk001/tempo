"use client";

/**
 * Delete tombstones for cloud sync. When a task/session is deleted locally
 * we remember its id so the next push can delete it on the server too —
 * otherwise a later pull would resurrect it on this device.
 */

const KEY = "tempo-tombstones-v1";

export interface TombstoneSet {
  tasks: Record<string, number>;
  sessions: Record<string, number>;
}

const EMPTY: TombstoneSet = { tasks: {}, sessions: {} };

export function loadTombstones(): TombstoneSet {
  try {
    if (typeof window === "undefined") return structuredClone(EMPTY);
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { tasks: {}, sessions: {} };
    const parsed = JSON.parse(raw) as Partial<TombstoneSet>;
    return {
      tasks: parsed.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {},
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    };
  } catch {
    return { tasks: {}, sessions: {} };
  }
}

function save(set: TombstoneSet): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(set));
  } catch {
    // Storage full/blocked — sync degrades to push-only.
  }
}

export function addTaskTombstone(id: string): void {
  if (!id) return;
  const set = loadTombstones();
  set.tasks[id] = Date.now();
  save(set);
}

export function addSessionTombstone(id: string): void {
  if (!id) return;
  const set = loadTombstones();
  set.sessions[id] = Date.now();
  save(set);
}

export function addTaskTombstones(ids: string[]): void {
  if (ids.length === 0) return;
  const set = loadTombstones();
  const now = Date.now();
  for (const id of ids) if (id) set.tasks[id] = now;
  save(set);
}

export function addSessionTombstones(ids: string[]): void {
  if (ids.length === 0) return;
  const set = loadTombstones();
  const now = Date.now();
  for (const id of ids) if (id) set.sessions[id] = now;
  save(set);
}

/** Drop tombstones the server has confirmed (ids included in a successful push). */
export function pruneTombstones(taskIds: string[], sessionIds: string[]): void {
  if (taskIds.length === 0 && sessionIds.length === 0) return;
  const set = loadTombstones();
  for (const id of taskIds) delete set.tasks[id];
  for (const id of sessionIds) delete set.sessions[id];
  save(set);
}
