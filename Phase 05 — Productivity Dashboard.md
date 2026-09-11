# Phase 05 — Productivity Dashboard

## Objective

Create a useful daily productivity dashboard.

The dashboard should answer:

> What did I plan to do, and what did I actually do?

---

# 1. Today's Summary

Display:

```text
Today's Focus

Planned       8h 00m
Focused       6h 24m
Remaining     1h 36m

Pomodoros
8 completed

Interruptions
3

Focus Rate
80%
```

---

# 2. Task Progress

For each task:

```text
AI Agent Project

4h 20m / 6h

██████████████░░░░
```

---

# 3. Planned vs Actual

Create a visual comparison.

Example:

```text
Task                 Planned       Actual

AI Agent Project       6h            4h20m
Backend Learning       3h            2h04m
System Design          2h            1h40m
```

---

# 4. Focus Timeline

Show today's sessions chronologically.

Example:

```text
09:00  AI Agent Project
09:50  Break
10:00  AI Agent Project
10:50  Break
11:00  Backend
```

---

# 5. Interruption Statistics

Show:

```text
Total interruptions
Average interruptions/session
Total paused time
```

Avoid judging the user.

Do not use negative language such as:

```text
You failed.
You were distracted.
```

Use neutral language:

```text
3 interruptions
18 minutes paused
```

---

# 6. Empty State

If no work has been tracked:

```text
Nothing tracked yet.

Create a task or connect Google Calendar
to plan your day.
```

---

# Acceptance Criteria

The dashboard must:

- show today's planned time
- show actual focus time
- show remaining time
- show Pomodoro completion
- show interruptions
- show task progress
- show session timeline
- work with no data
- remain usable on desktop