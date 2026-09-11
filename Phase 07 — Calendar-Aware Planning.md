# Phase 07 — Calendar-Aware Planning

## Objective

Connect planned Calendar time with Pomodoro scheduling.

The application should understand when the user has time available for a task.

---

# 1. Time Blocks

Example Calendar:

```text
09:00 - 12:00
AI Agent Project

12:00 - 13:00
Lunch

14:00 - 17:00
Backend Learning
```

Convert this into usable work blocks.

---

# 2. Available Time

For each task calculate:

```text
allocated time
calendar availability
completed focus
remaining work
```

---

# 3. Pomodoro Planning

Example:

```text
Available:
09:00 → 12:00

Focus:
50m
Break:
10m
```

Generate:

```text
09:00 - 09:50 Focus
09:50 - 10:00 Break

10:00 - 10:50 Focus
10:50 - 11:00 Break

11:00 - 11:50 Focus
11:50 - 12:00 Break
```

---

# 4. Conflict Detection

If a planned Pomodoro overlaps another Calendar event:

```text
Conflict detected

Your planned focus session overlaps:

14:00 - 15:00
Meeting
```

Allow the user to adjust the plan.

Do not silently overwrite Calendar events.

---

# 5. Remaining Work

Example:

```text
Task:
AI Agent Project

Allocated:
6h

Completed:
3h20m

Remaining:
2h40m
```

Suggest available Pomodoro blocks based on remaining time.

---

# 6. Planning UI

Create a simple day planner.

Display:

```text
09:00 ── Focus ── 09:50
09:50 ── Break ── 10:00
10:00 ── Focus ── 10:50
10:50 ── Break ── 11:00
```

---

# Acceptance Criteria

The application must:

- understand Calendar time blocks
- calculate available work time
- generate Pomodoro blocks
- detect conflicts
- calculate remaining work
- avoid silently overwriting Calendar events
- allow the user to adjust the generated plan