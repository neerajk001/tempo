# UI Implementation Status

Source of truth: `public/` PNG + HTML references. Design tokens: `public/tempo_console/DESIGN.md`.

Reference map:

| # | Screen | Reference folder | Route |
|---|---|---|---|
| 1 | Authentication | `tempo_authentication/` | `/login` |
| 2 | Dashboard | `tempo_today_command_center/` | `/` |
| 3 | Focus Mode | `tempo_focus_mode/` | `/focus` |
| 4 | Break | `tempo_pomodoro_break/` | timer break state (`/`, `/focus`) |
| 5 | Session Complete | `tempo_session_completion/` | timer completed state (`/`, `/focus`) |
| 6 | Tasks | `tempo_tasks_planned_work/` | `/tasks` |
| 7 | Task Details | `tempo_task_details_build_ai_agent_system/` | `/tasks/[id]` (new) |
| 8 | Calendar | `tempo_calendar_time_blocking/` | `/calendar` |
| 9 | History | `tempo_history_deep_work_audit/` | `/history` |
| 10 | Daily Review | `tempo_daily_review/` | `/` review section (TBD per ref) |
| 11 | Settings | `tempo_settings/` | `/settings` |
| 12 | Google Calendar Connection | `tempo_google_calendar_integration/` | `/calendar` connect state |
| 13 | New Task Modal | `tempo_new_task_modal/` | modal on `/tasks` (+ `/`) |

Shared assets: `tempo_logo/screen.png`, `close_up_professional_portrait_photo_of_a_focused_tech_professional_neeraj/`, `icons/`.

## Progress
- [x] Screen 1 — Authentication (`/login`): full-bleed overlay per ref (status bar, monogram, card, kbd hint, footer). Enter=sign in, Esc=home. tsc+lint+build pass. Smoke: `/login` 200 (post-hydration content comes from next-auth session fetch; static shell verified in HTML).
- [x] Screen 2 — Dashboard (`/`): command-center per ref — shell (TopBar + WORKSPACES sidebar + portrait avatar), greeting header w/ week/flow state + Today/Cal-sync/⌘K controls, 6-card metric ribbon (live stats, pomo segments, day-over-day delta), live focus card (ring, dots, +5m extend, log-interruption, scratchpad), schedule w/ All/Active/Upcoming tabs, Up Next, Planned vs Actual, Interruption Log (+manual diversions), Standby. tsc+lint+build pass, 55 tests pass. Smoke: `/` 200, all sections present.
- [x] Screen 3 — Focus Mode (`/focus`): immersion view per ref — ambient glow, header (brand + flow state, session pill, Brown-Noise toggle, Active/Paused segmented, Exit/Esc), 400px gauge dial w/ tick ring + tabular numerals + telemetry, Pause/End Block/+5m/Log/Scratchpad w/ brain-dump drawer (Enter-to-park), telemetry strip + hotkey legend (Space/Esc/L/M/N, R kept). Real brown-noise WebAudio player; shared `useFinishSession` (timer refactor, dead `PomodoroTimer` removed). tsc+lint pass. Smoke: `/focus` 200 (content post-hydration by design).
- [x] Screen 4 — Break (`/break`): restorative view per ref — teal utility bar (Break Mode badge, Short/Long switcher w/ real config minutes, Forest Rainfall rain-texture toggle, Exit/Esc), breathing-halo 380px dial w/ teal-sky gradient arc + SHORT/LONG copy variants, Skip Break (Space → completes break, starts next focus, jumps to `/focus`), End Session, Session Information (last logged focus block) + Next Up (Stage n/m, play starts it) cards, footer legend + Auto-advance Off + live daily target. Shortcuts Space/Esc/M/1/2. Dashboard card links Break view when on break. tsc+lint+build pass. Smoke: `/break` 200.
- [x] Screen 5 — Session Complete (`/complete`): celebration per ref — chrome w/ POMODORO COMPLETE + Session n/m, truthful Session-logged meta (no fake GCal write), animated check disc + rise-ins, results card (live focused/paused/interruptions/efficiency), task progress card, Start Break (Space, real break minutes) / Start Next Focus (F) / Done-Esc, telemetry dock w/ live daily goal. Completions from dashboard + focus view route here (breaks excluded). tsc+lint+build pass, 55 tests pass. Smoke: `/complete` 200.
- [x] Screen 6 — Tasks (`/tasks`): full table per ref — breadcrumb header + Active-Today pill, Import Calendar (/calendar) + New Task (C opens modal), Today/Upcoming/Completed tabs w/ live counts, live search (/ focuses), Source (All/Calendar/Manual) + Status + Sort pills, 4-card metric band w/ efficiency ring, Today group (progress rows, priority chips, live status chips, Start/Open/Resume/Queue actions, sync indicator, Edit/Complete/Cancel/Delete menu, done checkboxes), Upcoming collapsible w/ preview rows + allocated total, sync banner. Reference-needed `project` + `priority` fields added to store (validated, legacy-safe). tsc+lint+build pass, 55 tests pass. Smoke: `/tasks` 307→login (protected), `/` 200.
- [x] Screen 7 — Task Details (`/tasks/[id]`): per ref — breadcrumb + live session chip + keybind legend (?), header card (project/priority/status/due badges, copy-markdown, Focus Now (F), Edit (E), calendar/share/menu actions), 4 stat tiles + trajectory bar w/ milestones + live center label, live session banner (pause/complete), Session Audit Log (real per-session focus scores → history details), Execution Timeline (merged START/PAUSE/RESUME/COMPLETE events + key-moments filter), Subtasks checklist (add/toggle/remove, S focuses), scratchpad editor, Integrations & Trace (calendar block, created-by). New `subtasks` store slice (tested). Titles across Tasks/Dashboard now link here. tsc+lint pass.
- [x] Screen 8 — Calendar (`/calendar`): time engine per ref — header (Time Engine badge, live sync age, Sync Now, account pill), day nav + Today + Day/3-Day views (Week marked soon), 5-card telemetry (work cap, focus ratio, meetings, buffers, live collision alert), 08:00–19:00 grid w/ now-cursor, G-Cal blocks, task blocks w/ pomodoro slices + live progress, open-buffer blocks, collision callout w/ working Auto-Shift (+60m) / Adjust Plan (/plan) / Ignore, mini-month picker w/ task dots, Backlog Queue w/ real Block-Time scheduling into free gaps, integrations (Google real, Tempo Tasks real), C/T/S shortcuts, Quick Add modal. Middleware fixed to cover nested routes (`/tasks/*`, `/history/*`). tsc+lint+build pass, 58 tests pass. Smoke: `/calendar`+`/tasks/*`+`/history/*` 307 gated, `/` 200.
- [x] Screen 9 — History (`/history`): audit workspace per ref — header (live UTC badge, sync pill, Metrics toggle, working Export CSV ⌘E), range toolbar (Today/Yesterday/This Week/Custom w/ date inputs + period nav), Sessions/Tasks/Projects groupings, live search + project filter, 4 KPI cards over range (goal/adherence, intentional finish, avg breach, cadence), day-grouped table w/ pagination, Mon–Sun distribution, inline Session Detail inspector (micro-timeline w/ computed pause spans, flow-index percentile, Re-run/Delete) reused by `/history/[id]`. tsc+lint pass.
- [x] Screen 10 — Daily Review (`/review`, linked from Standby Quick Review): per ref — day nav, Export Summary (markdown ⌘E) / Print / Done (Esc), hero w/ adherence + variance narrative + composition bar + dial, 5 tiles, Task Adherence Matrix w/ observation card (longest clean stretch computed), Day Sequence merging sessions + meetings, Tomorrow staged blocks + Adjust Plan (T). Protected route. tsc+lint pass.
- [x] Screen 11 — Settings (`/settings`): per ref — anchor nav, Focus Rhythm (preset pills + steppers wired to engine, auto-start prefs), Audio & Alerts (permission-aware notify toggles, review-prompt nudge, chime themes + Test Audio), Appearance (Light active; Dark/System honestly disabled; working compact density), Calendar & Sync (account card, single-stream note, Auto-Shift pref), Data & Privacy (real JSON/CSV export, confirmed local wipe), Shortcuts reference. Prefs persisted (`tempo-prefs-v1`); auto-start + chimes wired into finish flow with double-start guards. tsc+lint pass.
- [x] Screen 12 — Google Calendar Connection (`/settings/integrations/google-calendar`): per ref minus the design-tool simulator — real Connected/Disconnected/Error states from session, hub card (read-only badge, Sync Now + toast, Change Account, confirmed Disconnect), telemetry (live stamp, manual-refresh note, linked-task counts), primary-calendar row, truthful readonly permissions card, collision-mode config w/ reset. No fake webhooks/latency/Linear rows. tsc+lint pass.
- [x] Screen 13 — New Task Modal: diffed `tempo_new_task_modal/` against the Screen 6 build and aligned — max-w-xl bordered shell, Focus Block badge, REQUIRED label, single date box, 2h/4h/6h presets, calendar select w/ Do-not-link option, Allocated/Est row w/ cycle dots, ⌘Enter/Esc footer hints. Cadence card fully customizable: Focus Window (15/25/50/90), Short Break (3/5/10/15), Long Break (15/20/30/45) + interval (after 2–6), all persisted per task (null = workspace defaults). Kept justified supersets: Project + Priority rows (Tasks table requires the data). tsc+lint+build pass, 59 tests pass (incl. cadence validation). Smoke: `/history`, `/review`, `/settings`, `/settings/integrations/google-calendar` 307 gated, `/` 200.

## Bugfixes (post-screen user reports)- 2026-09-10 — Stranded live timer: a task marked Done while its pomodoro ran vanished from
  Today with no path back. Today now always lists the timer-linked task, its status chip and
  row action follow the live timer (In Progress/Paused/Open Focus/Resume), and the empty
  state links the Completed tab count.
- 2026-09-10 — Full-screen reachability: dashboard chrono (clock + ring) links to `/focus`
  (`/break` on breaks) with hover affordance, plus a prominent Full screen button next to DND.
- 2026-09-10 — Dashboard schedule parity: the schedule list now applies the same
  live-timer precedence (In Progress/Paused/Open-focus/live countdown on the running
  task even when marked Done) instead of a dead Done chip.
- 2026-09-10 — DB wipe (user request): deleted all Task/PomodoroSession/SessionEvent
  rows via `scripts/db-wipe.mjs`; User rows preserved (1 user kept, login intact).
- 2026-09-10 — Delete cascades to timer: `removeTask` now calls the timer's
  `detachTask` — a live session on the deleted task is stopped (partial work
  logged to History as CANCELLED) and the dashboard link cleared, so nothing
  stale remains on the main view. Deleting anything else leaves the timer alone.
- 2026-09-10 — Single-active invariant: `start`/`startForTask`/`startBreak` first
  stop any RUNNING/PAUSED session (logged to History as CANCELLED with its partial
  timestamps) so two pomodoros can never run at once. Covered by
  `pomodoro-single-active` store tests (4).
- 2026-09-10 — Calendar grid window: the timeline was hardcoded 08:00–19:00, so
  late/early events (e.g. 21:30–23:00) were fetched but never rendered. The grid
  now expands per day to fit out-of-window events/tasks (clamped to the day);
  buffer telemetry follows the same span. Covered by `day-bounds` tests (4).
- 2026-09-10 — Contained timeline scroll: the day grid scrolls inside a capped
  68vh viewport and auto-jumps to the now-cursor (or the day's first block), so
  the page never grows with late hours. Pure `initialScrollTop` helper, tested.
- 2026-09-10 — Upcoming Google events on Tasks: the Upcoming group now lists the
  next-7-days unplanned calendar events with date • time range + allotted
  duration and one-click Plan as Task (local + best-effort server save, deduped).
- 2026-09-10 — Upcoming events visibility states: the section no longer hides
  silently — signed-out shows a Connect prompt, loading shows progress, failures
  show the error with Retry, empty shows a 7-day note. Range starts now (tonight's
  remaining events included) instead of tomorrow.

## Stale-UI audit & removal (2026-09-10)

Removed (no effect on the app): TopBar notification/help buttons (avatar now links to
Settings); login Documentation/Support/SSO/policy dead links; Settings Dark/System
cards, menu-bar widget row, single-option calendar-stream select (static text);
Calendar Week button + Connect-Another button; DND chips (dashboard + focus view);
unused exports (`selectTodayTasks`, `describePhase`, `formatSessionClock`, `PREF_DEFAULTS`).
Reworded Standby card (no background sync exists).
Made honest (was claimed but unwired): Tasks ⌘I→Calendar, global ⌘K→Tasks, dashboard
Space/R/F shortcuts, History sync age (live stamp), Review midday marker (session
midpoint), Settings shortcut table now documents where each hotkey works.
Kept (reference-faithful, harmless): duplicate Dashboard/Today nav, `/dashboard`
redirect route, server API routes (backend for persistence).
