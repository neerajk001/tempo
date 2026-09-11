# Phase 04 — Session Tracking

## Objective

Turn the Pomodoro timer into a real activity tracking system.

Every meaningful action must be recorded.

---

# 1. Session Events

Record:

```text
START
PAUSE
RESUME
COMPLETE
CANCEL
```

Each event should contain:

```text
sessionId
eventType
timestamp
```

---

# 2. Interruption Tracking

Every pause counts as an interruption.

Example:

```text
Session:

50 minutes planned

Focus:
23 minutes

Pause:
4 minutes

Focus:
27 minutes
```

Result:

```text
Focused: 50m
Paused: 4m
Interruptions: 1
```

---

# 3. Multiple Interruptions

Support:

```text
START
PAUSE
RESUME
PAUSE
RESUME
PAUSE
RESUME
COMPLETE
```

Calculate total paused time correctly.

---

# 4. Session History

Create a history screen.

Example:

```text
September 10

AI Agent Project
09:00 - 09:50
50m focused
1 interruption

Backend Learning
10:00 - 10:50
45m focused
2 interruptions
```

---

# 5. Session Details

Clicking a session should show:

```text
Task
Planned duration
Actual focus duration
Paused duration
Number of interruptions
Start time
End time
```

Optionally display the event timeline.

---

# 6. Analytics Functions

Create reusable functions:

```text
calculateFocusDuration()
calculatePausedDuration()
calculateInterruptions()
calculateCompletionRate()
```

These must be pure functions where possible.

Write unit tests.

---

# Acceptance Criteria

The phase is complete when:

- every session action is recorded
- interruptions are counted
- pause duration is calculated
- session history exists
- session details exist
- analytics calculations are tested
- refresh does not corrupt session data
- tests pass