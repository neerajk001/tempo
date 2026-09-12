export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type SessionStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type SessionType = "FOCUS" | "SHORT_BREAK" | "LONG_BREAK";
export type SessionEventType = "START" | "PAUSE" | "RESUME" | "COMPLETE" | "CANCEL";

// Focus scheduling mode for a task / live session.
// - "allocated": classic Pomodoro flow with a fixed allocation + slices.
// - "infinite": open-ended focus with no fixed end time; elapsed is tracked.
export type FocusMode = "allocated" | "infinite";

// Aliases used by the Pomodoro engine (same state machine, friendlier names)
export type PomodoroStatus = SessionStatus;
export type PomodoroPhase = SessionType;
export type PomodoroEventType = SessionEventType;
