# Personal Pomodoro Productivity System

A personal desktop-first productivity application that combines:

- Pomodoro time tracking
- task planning
- activity tracking
- interruption tracking
- Google Calendar
- planned vs actual productivity analytics

## Core Philosophy

```text
PLAN
 ↓
FOCUS
 ↓
TRACK
 ↓
REVIEW
 ↓
IMPROVE
```

The goal is not to gamify productivity.

The goal is to make actual working time visible.

---

# Core Flow

```text
Google Calendar
       ↓
Planned Time
       ↓
Tasks
       ↓
Pomodoro Sessions
       ↓
Focus / Break
       ↓
Session Events
       ↓
Activity History
       ↓
Daily Dashboard
```

---

# Example

A Calendar event:

```text
10:00 → 16:00
Build AI Agent Project
```

becomes:

```text
Task:
Build AI Agent Project

Allocated:
6 hours
```

The Pomodoro engine can then divide it into:

```text
50m Focus
10m Break

50m Focus
10m Break

50m Focus
10m Break

...
```

The system records what actually happened.

Example:

```text
Planned:
6h

Focused:
4h42m

Paused:
18m

Interruptions:
4

Completed Pomodoros:
5
```

---

# Development Phases

```text
01 Foundation
02 Pomodoro Engine
03 Task Management
04 Session Tracking
05 Dashboard
06 Google Calendar
07 Calendar-Aware Planning
08 Authentication
09 Desktop/PWA
10 Polish & Production
```

Each phase has its own specification inside:

```text
/phases
```

---

# AI Agent Workflow

An AI coding agent should execute phases sequentially.

For each phase:

```text
Read AGENTS.md
      ↓
Read phase specification
      ↓
Inspect repository
      ↓
Implement
      ↓
Run tests
      ↓
Run typecheck
      ↓
Run lint
      ↓
Run build
      ↓
Fix failures
      ↓
Verify existing functionality
      ↓
Mark phase complete
```

Never skip validation simply because the implementation appears correct.

---

# Important Architectural Principle

The timer is not the source of truth.

Timestamps are.

The frontend may display:

```text
47:32
```

but the system should know:

```text
startedAt
pausedAt
resumedAt
endedAt
```

This makes the timer resilient to:

- browser refresh
- inactive tabs
- laptop sleep
- network interruptions
- temporary application failures

---

# Product Direction

Keep the product personal and focused.

Do not turn the first version into:

- a project management platform
- a social network
- a habit tracker
- a gamified productivity platform
- a complicated enterprise calendar

The application exists primarily to help one person answer:

> "What am I supposed to work on right now, and how much actual focused work did I do?"