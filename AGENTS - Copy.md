# Pomodoro Productivity App — AI Agent Instructions

## 1. Project Mission

Build a personal web-based productivity application centered around Pomodoro sessions, task allocation, activity tracking, interruption tracking, and Google Calendar integration.

The application is primarily for personal desktop use.

The core principle is:

> Plan work → execute focused sessions → record what actually happened → compare planned vs actual work.

The application must remain simple, fast, distraction-free, and reliable.

---

# 2. Autonomous Execution Rules

You are an autonomous software engineering agent.

For every phase:

1. Inspect the existing repository before making changes.
2. Understand the current implementation.
3. Read the current phase MD file completely.
4. Implement all requirements in that phase.
5. Do not unnecessarily modify unrelated functionality.
6. Run tests/type checks/lint/build after implementation.
7. Fix errors before considering the phase complete.
8. Verify that existing functionality still works.
9. Update documentation when architecture or behavior changes.
10. Do not stop merely because implementation is difficult.
11. If a reasonable implementation decision is required, make the decision yourself based on this specification.
12. Prefer simple solutions over unnecessary abstractions.
13. Never introduce dependencies without a clear reason.
14. Never replace working functionality merely because another implementation is possible.

---

# 3. Technology Stack

Use the following stack unless an existing repository already has an equivalent implementation.

## Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- Zustand for client-side application state

## Backend

Use Next.js server-side functionality initially.

Do not introduce microservices.

## Database

- PostgreSQL
- Prisma ORM

## Authentication

- Google OAuth / Auth.js

## Calendar

- Google Calendar API

## Deployment

Designed for:

- Vercel
- PostgreSQL provider such as Neon/Supabase

---

# 4. Product Principles

The UI should be:

- minimal
- desktop-first
- distraction-free
- responsive
- keyboard-friendly
- fast

Avoid unnecessary:

- social features
- gamification
- excessive notifications
- complicated dashboards
- meaningless animations

Animations should communicate state changes rather than exist only for decoration.

---

# 5. Core Concepts

The application has five primary concepts.

## Task

A piece of planned work.

Example:

```text
Build AI Agent Project
Allocated: 6 hours
Date: September 10
```

## Pomodoro Session

A focused work interval associated with a task.

Example:

```text
50 minute focus session
10 minute break
```

## Session Event

An event occurring during a Pomodoro session.

Examples:

```text
START
PAUSE
RESUME
COMPLETE
CANCEL
```

## Calendar Event

A Google Calendar event representing planned time.

## Activity

The actual work performed by the user.

The application should allow comparison between:

```text
planned time
vs
actual focused time
```

---

# 6. Time Tracking Rules

Do not rely exclusively on a frontend countdown timer.

The source of truth for a running session should be timestamps.

Store:

```text
startedAt
pausedAt
resumedAt
endedAt
```

The application must be able to calculate actual duration from timestamps.

The timer UI may update every second, but database persistence should not happen every second.

Persist meaningful state transitions instead:

```text
START
PAUSE
RESUME
COMPLETE
CANCEL
```

---

# 7. Interruption Tracking

Every pause should be recorded.

Example:

```text
START
10:00

PAUSE
10:23

RESUME
10:27

COMPLETE
10:50
```

The application should calculate:

```text
Focus time = 46 minutes
Paused time = 4 minutes
Pause count = 1
```

Do not lose interruption history.

---

# 8. Pomodoro Configuration

The user should eventually be able to configure:

```text
Focus duration
Short break duration
Long break duration
Long break interval
```

Example defaults:

```text
Focus: 50 minutes
Short break: 10 minutes
Long break: 30 minutes
Long break after: 4 sessions
```

Do not hard-code these values throughout the application.

Centralize configuration.

---

# 9. Data Integrity

Never trust client-provided calculated values when the server can calculate them.

For example:

Bad:

```text
actualDuration: 3600
```

sent from the client and blindly stored.

Better:

```text
startedAt
endedAt
pause events
```

and calculate duration from authoritative timestamps.

---

# 10. Error Handling

Every external integration must handle failure gracefully.

Examples:

- Google Calendar unavailable
- OAuth expired
- database unavailable
- invalid calendar event
- network interruption
- duplicate request
- timer state mismatch

The application should not crash because Calendar temporarily fails.

Local timer functionality should remain usable even if Calendar is unavailable.

---

# 11. Testing

Every phase must include appropriate tests.

At minimum:

- TypeScript type checking
- linting
- unit tests for important business logic
- build verification

Timer logic must have automated tests.

Test edge cases such as:

- pause immediately after start
- multiple pauses
- resume after pause
- completing after pause
- cancelling a session
- browser refresh
- invalid session state
- crossing midnight where relevant

---

# 12. Definition of Done

A phase is complete only when:

- requirements are implemented
- code compiles
- tests pass
- lint passes
- production build passes
- no obvious console errors remain
- UI behavior is verified
- existing functionality still works
- documentation is updated if necessary

Do not declare completion based only on "code written".

---

# 13. Phase Execution

Execute phases in this order:

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

Each phase must leave the repository in a working state.

---

# 14. Autonomous Decision Making

If a requirement is ambiguous:

1. Prefer the simplest implementation.
2. Preserve existing architecture.
3. Choose conventional Next.js/TypeScript patterns.
4. Avoid premature abstraction.
5. Document important architectural decisions.

Do not ask the user for permission for routine implementation decisions.

Only stop for clarification when proceeding would create a fundamentally different product or risk destructive data loss.

---

# 15. Final Product Goal

The finished application should allow the user to:

1. Connect Google Calendar.
2. See planned work.
3. Create or import tasks.
4. Allocate time to tasks.
5. Automatically divide allocated work into Pomodoro sessions.
6. Start a Pomodoro.
7. Pause/resume it.
8. Track interruptions.
9. Take breaks.
10. Complete sessions.
11. Track actual focused time.
12. Compare planned vs actual work.
13. Review daily productivity.
14. Use the application comfortably on desktop without needing a phone.

The application should feel like a focused personal work console rather than a generic task manager.