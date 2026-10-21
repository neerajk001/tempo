# Personal Pomodoro Productivity System

A personal desktop-first productivity application that combines:

- Pomodoro time tracking
- task planning
- activity tracking
- interruption tracking
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

A task with a 6-hour estimate:

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

---

# Running Locally

```bash
npm install
cp .env.example .env   # fill in values, never commit .env
npx prisma db push
npm run dev            # http://localhost:3000
```

Quality gates (every phase must pass all four):

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

# Desktop App (Tauri)

The native app is a fully local, offline build (Tauri 2 + WebView2): no server, no
account, no database. Tasks, sessions, and settings live on the device, inside the
app's WebView profile.

```bash
npm run desktop:dev     # native shell against the dev server
npm run build:desktop   # static export -> out/ (API + dynamic routes excluded)
npm run desktop:build   # release binary + installer
```

Outputs:

```text
src-tauri/target/release/tempo.exe                              portable binary
src-tauri/target/release/bundle/nsis/Tempo_<version>_x64-setup.exe   per-user installer
```

Native behavior:

- Closing the main window hides it to the tray; quit from the tray menu.
- Global hotkey `Ctrl+Shift+Space` shows/hides the window.
- Always-on-top mini timer widget, toggleable from the tray.
- Native notifications, Windows taskbar progress, idle auto-pause.
- Focus Guard (hosts-file site blocking) is Windows-only and installs a one-time
  scheduled task with a single UAC prompt; it is hidden on other platforms.
- Single instance, window geometry restore, and a "Start on login" tray toggle.

The installer is per-user (no admin) and unsigned, so Windows SmartScreen may warn
on first run. Rebuilding with a newer version and running the new installer upgrades
in place. Exports (JSON archive / CSV metrics) are the backup path for local data.

Publishing: attach the installer to a GitHub release under the stable asset name
`Tempo_x64-setup.exe`. `/download` links to
`releases/latest/download/Tempo_x64-setup.exe`, so that URL keeps working across
versions as long as the asset name stays the same.

# Environment

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Postgres (Neon/Supabase). Server persistence for tasks/sessions. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth sign-in. |
| `GOOGLE_REDIRECT_URI` | Must match the OAuth client redirect: `<origin>/api/auth/callback/google`. |
| `NEXTAUTH_URL` | App origin (`http://localhost:3000` locally). |
| `NEXTAUTH_SECRET` | Encrypts the session JWT. |

Google Cloud setup: enable the OAuth consent screen → Web OAuth client with the
redirect above. No Calendar scopes are requested. The desktop build needs none of
these variables.

# Routes

```text
/              Dashboard: timer + today's planned vs actual (open, works offline)
/focus         Distraction-free focus view, keyboard shortcuts (open)
/tasks         Task CRUD + Start Focus (sign-in)
/plan          Day planner (sign-in)
/history       Session history + details (sign-in)
/history/[id]  Session timeline (sign-in)
/settings      Pomodoro config + notifications (sign-in)
/login         Google sign-in
/api/tasks, /api/sessions, /api/sync  (sign-in, user-scoped, 401 otherwise)
```

In the desktop build the API, auth, and dynamic routes are excluded; the same screens
run from the static export with local storage.

# Production Checklist

- `DATABASE_URL` points at production Postgres; `npx prisma db push` applied.
- Google OAuth client has the production redirect `https://<app>/api/auth/callback/google`.
- `NEXTAUTH_URL` is the production origin; `NEXTAUTH_SECRET` is a fresh random value.
- HTTPS on (required for PWA install + OAuth); `/manifest.webmanifest` served.
- Timer writes only on state transitions (no per-second persistence); history capped
  client-side.
- Personal single-user threat model: per-user row isolation is enforced server-side
  (`requireUser`), but there is no rate limiting or team/roles support by design.