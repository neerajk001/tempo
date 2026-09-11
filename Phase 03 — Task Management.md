# Phase 03 — Task Management

## Objective

Allow the user to create planned work and assign Pomodoro sessions to it.

---

# 1. Task Creation

Create task form:

```text
Task name
Description
Date
Allocated hours/minutes
Pomodoro configuration
```

Example:

```text
Task:
Build AI Agent Project

Allocated:
6 hours

Pomodoro:
50 / 10
```

---

# 2. Task List

Display today's tasks:

```text
AI Agent Project
6h allocated
2h 30m completed

Backend Learning
3h allocated
1h completed
```

---

# 3. Task Status

Implement:

```text
TODO
IN_PROGRESS
COMPLETED
CANCELLED
```

---

# 4. Pomodoro Calculation

Given:

```text
allocatedMinutes = 360
focusDuration = 50
```

Calculate the number of required focus sessions.

Do not simply use:

```text
360 / 50
```

without considering how the final partial session should behave.

Define a consistent strategy for the final session.

Example:

```text
360 minutes

50
50
50
50
50
50
10
```

The UI should clearly communicate the final shorter session if one exists.

---

# 5. Start Task

A task should have:

```text
[ Start Focus ]
```

Clicking it should create/start the appropriate Pomodoro session.

---

# 6. Remaining Work

Display:

```text
Allocated: 6h
Focused: 2h 30m
Remaining: 3h 30m
```

---

# 7. Database

Connect tasks to sessions.

A task should be able to retrieve:

- total sessions
- completed sessions
- total focus duration
- remaining planned duration

---

# Acceptance Criteria

The phase is complete when:

- tasks can be created
- tasks can be edited
- tasks can be completed
- tasks can be deleted/cancelled
- allocated time is stored
- Pomodoro sessions can belong to tasks
- progress is calculated correctly
- UI displays progress
- all tests pass