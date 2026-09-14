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
import { useAmbientStore } from "@/stores/ambient-store";

/**
 * Shared finish actions (Complete / Cancel) so the dashboard timer and the
 * distraction-free focus view record identical history, task progress, and
 * optional completion notifications.
 */
export function useFinishSession() {
  const session = usePomodoroStore((s) => s.session);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const activeTaskTitle = usePomodoroStore((s) => s.activeTaskTitle);
  const focusMode = usePomodoroStore((s) => s.focusMode);
  const sessionName = usePomodoroStore((s) => s.sessionName);
  const complete = usePomodoroStore((s) => s.complete);
  const cancel = usePomodoroStore((s) => s.cancel);
  const tasks = useTaskStore((s) => s.tasks);
  const recordFocus = useTaskStore((s) => s.recordFocus);
  const logSession = useSessionHistoryStore((s) => s.logSession);

  const activeTask = selectTaskById(tasks, activeTaskId);
  const isInfinite = focusMode === "infinite";

  const handleComplete = () => {
    const at = Date.now();
    let snapshot;
    try {
      snapshot = completeSession(session, at);
    } catch {
      return;
    }
    // Pauses are manual — no automatic break accrues, so break time is 0.
    const breakMs = 0;
    const focusedMs = getElapsedFocusMs(snapshot, at);
    const taskTitle = activeTask?.title ?? activeTaskTitle;
    complete();
    // Natural or manual completion only (never pause/cancel): stop ambient
    // music first so the completion chime is clearly audible.
    try {
      useAmbientStore.getState().setMusicPlaying(false);
    } catch {
      // Ambient store optional — never block completion.
    }
    if (snapshot.phase === "FOCUS" && activeTaskId) {
      if (isInfinite) {
        // Infinite: open-ended — save the final focused/break duration
        // precisely (no minute rounding loss) and preserve cycle state.
        useTaskStore.getState().accumulateProgress(activeTaskId, {
          focusedMs: Math.max(0, Math.round(focusedMs)),
          breakMs,
          interruptions: snapshot.pauseCount,
          completedFocusCount: snapshot.completedFocusCount,
          lastPhase: snapshot.phase,
        });
      } else {
        // Allocated: existing minute-based workflow unchanged, plus
        // interruption/cycle preservation for exact resume.
        recordFocus(activeTaskId, Math.max(1, Math.round(focusedMs / 60000)));
        useTaskStore.getState().accumulateProgress(activeTaskId, {
          interruptions: snapshot.pauseCount,
          completedFocusCount: snapshot.completedFocusCount,
          lastPhase: snapshot.phase,
        });
      }
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
        focusedMs,
        pausedMs: getPausedMs(snapshot, at),
        interruptions: snapshot.pauseCount,
        events: snapshot.events,
        sessionMode: focusMode,
        sessionName,
        breakMs,
      });
    }
    // The completion chime follows the sound theme ("muted" = silent) and
    // always plays. The notify toggles only gate the desktop banner.
    const prefs = usePrefsStore.getState();
    playChime(prefs.chimeTheme);
    const wantsBanner = snapshot.phase === "FOCUS" ? prefs.notifyFocus : prefs.notifyBreak;
    if (wantsBanner) {
      sendCompletionNotification(snapshot.phase, taskTitle);
    }
    // Deliberate-start defaults: only auto-advance where the user enabled it.
    // Infinite sessions never auto-advance into phase breaks (pause-breaks
    // are handled inline via the pause countdown instead).
    try {
      if (snapshot.phase === "FOCUS" && prefs.autoStartBreaks && !isInfinite) {
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
    const breakMs = 0;
    const focusedMs = getElapsedFocusMs(snapshot, at);
    cancel();
    // Stopping preserves state: fold partial work into the task so returning
    // resumes from the exact previous totals (never resets to zero).
    if (snapshot.phase === "FOCUS" && activeTaskId) {
      useTaskStore.getState().accumulateProgress(activeTaskId, {
        focusedMs: Math.max(0, Math.round(focusedMs)),
        breakMs,
        interruptions: snapshot.pauseCount,
        completedFocusCount: snapshot.completedFocusCount,
        lastPhase: snapshot.phase,
      });
    }
    if (snapshot.startedAt !== null && snapshot.endedAt !== null) {
      logSession({
        taskId: activeTaskId,
        taskTitle: activeTask?.title ?? activeTaskTitle,
        phase: snapshot.phase,
        status: "CANCELLED",
        plannedMs: snapshot.plannedMs,
        startedAt: snapshot.startedAt,
        endedAt: snapshot.endedAt,
        focusedMs,
        pausedMs: getPausedMs(snapshot, at),
        interruptions: snapshot.pauseCount,
        events: snapshot.events,
        sessionMode: focusMode,
        sessionName,
        breakMs,
      });
    }
  };

  return { handleComplete, handleCancel };
}
