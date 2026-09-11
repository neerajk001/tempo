# Phase 02 — Pomodoro Engine

## Objective

Build the core Pomodoro timer.

The timer must be reliable and timestamp-based.

---

# 1. Pomodoro States

Implement:

```text
IDLE
RUNNING
PAUSED
COMPLETED
CANCELLED
```

Break states:

```text
FOCUS
SHORT_BREAK
LONG_BREAK
```

Use a clear state machine rather than scattered booleans.

Avoid logic such as:

```text
isRunning
isPaused
isBreak
isCompleted
```

when a single explicit state can represent the state.

---

# 2. Timer Configuration

Create centralized configuration:

```text
focusDuration
shortBreakDuration
longBreakDuration
longBreakInterval
```

Provide sensible defaults:

```text
50 minutes
10 minutes
30 minutes
4 sessions
```

---

# 3. Timer Behavior

Implement:

```text
Start
Pause
Resume
Complete
Cancel
```

Example:

```text
IDLE
 ↓
START
 ↓
RUNNING
 ↓
PAUSE
 ↓
PAUSED
 ↓
RESUME
 ↓
RUNNING
 ↓
COMPLETE
 ↓
COMPLETED
```

Invalid transitions should be rejected.

---

# 4. Timestamp Model

When starting:

```text
startedAt = now
```

When pausing:

```text
pausedAt = now
```

When resuming:

```text
resume event = now
```

When completing:

```text
endedAt = now
```

Calculate elapsed focus time from timestamps.

---

# 5. UI

Create the central Pomodoro interface:

```text
AI Agent Project

47:32

[ Pause ]

Pomodoro 3 / 7

Next:
10 minute break
```

When paused:

```text
47:32

PAUSED

[ Resume ]
```

When completed:

```text
Session Complete

50:00 Focused

[ Start Break ]
```

---

# 6. Browser Refresh

A refresh must not destroy the current timer state.

On application startup:

- load active session
- inspect state
- calculate remaining time
- restore UI

Do not store only the remaining seconds.

---

# 7. Tests

Write unit tests for:

- starting
- pausing
- resuming
- completing
- cancelling
- multiple pauses
- elapsed time calculation
- invalid state transitions

---

# Acceptance Criteria

The phase is complete when:

- timer works
- pause/resume works
- completion works
- cancellation works
- state survives refresh
- timestamp-based calculations work
- tests pass
- lint passes
- TypeScript passes
- build passes