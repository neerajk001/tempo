# Phase 01 — Foundation

## Objective

Create the initial working application architecture.

At the end of this phase, the project must have:

- Next.js application
- TypeScript
- Tailwind
- basic layout
- navigation
- database configuration
- Prisma
- initial schema
- clean project structure

Do not implement Google Calendar yet.

Do not implement authentication yet.

Do not implement the complete Pomodoro engine yet.

---

# 1. Inspect Repository

Before changing anything:

- inspect package.json
- inspect existing source structure
- inspect configuration
- identify existing framework
- identify existing styling system
- identify existing database configuration

If the project is already initialized, preserve useful existing configuration.

---

# 2. Application Structure

Create a clean structure similar to:

```text
src/
├── app/
│   ├── page.tsx
│   ├── dashboard/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── layout/
│   └── pomodoro/
│
├── lib/
│   ├── db.ts
│   ├── utils.ts
│   └── constants.ts
│
├── stores/
│
├── services/
│
├── types/
│
└── hooks/
```

Do not create empty abstraction files unless they are actually needed.

---

# 3. Initial UI

Create a desktop-first dashboard.

It should contain:

```text
Sidebar

Dashboard
Tasks
Calendar
History
Settings
```

Main area:

```text
Today's Work

No active task

[ Start Focus ]

Today's Progress
```

The UI does not need full functionality yet.

---

# 4. Prisma Setup

Configure PostgreSQL and Prisma.

Create the initial entities needed for the application.

Minimum:

```text
Task
PomodoroSession
SessionEvent
```

Initial relationships should support:

```text
Task
  └── PomodoroSession
        └── SessionEvent
```

---

# 5. Environment Variables

Create an example environment file.

Example:

```text
DATABASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

Do not commit real secrets.

---

# 6. Quality Requirements

Run:

```bash
npm run lint
```

```bash
npx tsc --noEmit
```

```bash
npm run build
```

Fix all errors.

---

# Acceptance Criteria

The phase is complete when:

- application starts successfully
- dashboard renders
- navigation renders
- Prisma is configured
- database schema exists
- TypeScript passes
- lint passes
- production build passes

Do not move to Phase 02 until these conditions are satisfied.