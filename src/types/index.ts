export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type SessionStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type SessionType = "FOCUS" | "SHORT_BREAK" | "LONG_BREAK";
export type SessionEventType = "START" | "PAUSE" | "RESUME" | "COMPLETE" | "CANCEL";

// Aliases used by the Pomodoro engine (same state machine, friendlier names)
export type PomodoroStatus = SessionStatus;
export type PomodoroPhase = SessionType;
export type PomodoroEventType = SessionEventType;
