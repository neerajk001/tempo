"use client";

import { usePomodoroStore } from "@/stores/pomodoro-store";
import { useTaskStore, selectTaskById } from "@/stores/task-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { usePrefsStore } from "@/stores/prefs-store";
import {
  cancelSession,
  completeSession,
  getElapsedFocusMs,
  getPausedMs,
} from "@/lib/pomodoro-machine";
import { sendCompletionNotification } from "@/lib/notifications";
import { playChime } from "@/lib/chime";

/**
 * Shared finish actions (Complete / Cancel) so the dashboard timer and the
 * distraction-free focus view record identical history, task progress, and
 * optional completion notifications.
 */
export function useFinishSession() {
  const session = usePomodoroStore((s) => s.session);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const activeTaskTitle = usePomodoroStore((s) => s.activeTaskTitle);
  const complete = usePomodoroStore((s) => s.complete);
  const cancel = usePomodoroStore((s) => s.cancel);
  const tasks = useTaskStore((s) => s.tasks);
  const recordFocus = useTaskStore((s) => s.recordFocus);
  const logSession = useSessionHistoryStore((s) => s.logSession);

  const activeTask = selectTaskById(tasks, activeTaskId);

  const handleComplete = () => {
    const at = Date.now();
    let snapshot;
    try {
      snapshot = completeSession(session, at);
    } catch {
      return;
    }
    const taskTitle = activeTask?.title ?? activeTaskTitle;
    complete();
    if (snapshot.phase === "FOCUS" && activeTaskId) {
      recordFocus(activeTaskId, Math.max(1, Math.round(getElapsedFocusMs(snapshot, at) / 60000)));
    }
    if (snapshot.startedAt !== null && snapshot.endedAt !== null) {
      logSession({
        taskId: activeTaskId,
        taskTitle,
        phase: snapshot.phase,
        status: "COMPLETED",
        plannedMs: snapshot.plannedMs,
        startedAt: snapshot.startedAt,
        endedAt: snapshot.endedAt,
        focusedMs: getElapsedFocusMs(snapshot, at),
        pausedMs: getPausedMs(snapshot, at),
        interruptions: snapshot.pauseCount,
        events: snapshot.events,
      });
    }
    const prefs = usePrefsStore.getState();
    if (snapshot.phase === "FOCUS" && prefs.notifyFocus) {
      playChime(prefs.chimeTheme);
      sendCompletionNotification(snapshot.phase, taskTitle);
    } else if (snapshot.phase !== "FOCUS" && prefs.notifyBreak) {
      playChime(prefs.chimeTheme);
      sendCompletionNotification(snapshot.phase, taskTitle);
    }
    // Deliberate-start defaults: only auto-advance where the user enabled it.
    try {
      if (snapshot.phase === "FOCUS" && prefs.autoStartBreaks) {
        usePomodoroStore.getState().startBreak();
      } else if (snapshot.phase !== "FOCUS" && prefs.autoStartFocus) {
        usePomodoroStore.getState().start("FOCUS");
      }
    } catch {
      // Timer busy — leave the live session untouched.
    }
  };

  const handleCancel = () => {
    const at = Date.now();
    let snapshot;
    try {
      snapshot = cancelSession(session, at);
    } catch {
      return;
    }
    cancel();
    if (snapshot.startedAt !== null && snapshot.endedAt !== null) {
      logSession({
        taskId: activeTaskId,
        taskTitle: activeTask?.title ?? activeTaskTitle,
        phase: snapshot.phase,
        status: "CANCELLED",
        plannedMs: snapshot.plannedMs,
        startedAt: snapshot.startedAt,
        endedAt: snapshot.endedAt,
        focusedMs: getElapsedFocusMs(snapshot, at),
        pausedMs: getPausedMs(snapshot, at),
        interruptions: snapshot.pauseCount,
        events: snapshot.events,
      });
    }
  };

  return { handleComplete, handleCancel };
}
