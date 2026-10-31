# Tempo — Edge Cases, Bugs & Reliability Audit

Companion to `AUDIT_SUMMARY.md`. Every item lists severity, status, exact locations, root cause, impact, reproduction, fix, regression test, and effort.

Status: **CONFIRMED** = defect is directly traceable in the audited code. **HYPOTHESIS** = depends on OS/browser/timing/exploit conditions.

---

# A. Timer engine & session lifecycle

## TIM-01 — Sleep, quit, and long offline gaps are credited as focused time

- **Severity:** Critical
- **Status:** CONFIRMED
- **Files:** `src/lib/pomodoro-machine.ts:201-218`; `src/hooks/useFinishSession.ts:37-98`; `src/stores/pomodoro-store.ts:453-466`; `src-tauri/src/lib.rs:528-533`
- **Root cause:** `getElapsedFocusMs` is `now - startedAt - pausedMs` with no upper bound. Sleep/closed-app time is not paused time. `isExpired` only checks `remaining <= 0`, so the first completion after wake/relaunch uses the wake time as `endedAt`.
- **Impact:** A 25-minute focus followed by 2 hours asleep becomes a ~125-minute focus record, credits ~120 minutes to the task, and distorts Review/History/efficiency. Quitting from the tray and relaunching later has the same effect.
- **Reproduction:** Start 25m focus → sleep 2h (or quit via tray for 2h) → wake/relaunch → let the expiry effect run → inspect History and task `focusedMs`/`focusedMinutes`.
- **Fix:** Clamp allocated completions to `plannedMs` and compute `endedAt` as the scheduled end; persist a heartbeat/last-tick and treat a large gap as paused/cancelled; pause on app exit; decide infinite-mode sleep policy explicitly.
- **Regression test:** Fake clock +2h after a 25m start; assert `focusedMs === plannedMs`, task credit 25m, efficiency 100%, and a stale-gap flag/cancel path.
- **Effort:** M

## TIM-02 — Completion, chime, notification, break and block-clearing only run on three routes

- **Severity:** Critical
- **Status:** CONFIRMED
- **Files:** `src/components/dashboard/FocusSessionCard.tsx:71-74`; `src/components/pomodoro/FocusView.tsx:150-153`; `src/components/pomodoro/BreakView.tsx:60-63`; absent everywhere else (`/tasks`, `/tasks/[id]`, `/history`, `/settings`, `/plan`, `/review`, `/library`); `src/components/providers/DesktopBridge.tsx:146-166`
- **Root cause:** Expiry is a component-local effect; there is no root-level timer supervisor. `DesktopBridge` broadcasts/tooltips/progress only.
- **Impact:** On most routes the timer reaches zero but stays `RUNNING`. No history, no credit, no chime/notification, no auto-break, and Focus Guard remains applied. Returning much later triggers `TIM-01` over-credit. On desktop, this is the primary workflow when the main window is hidden to the tray.
- **Reproduction:** Start a 1-minute quick focus → navigate to `/tasks` → wait 30 minutes → return to `/`; the session completes with ~31m credited.
- **Fix:** Mount one `TimerSupervisor` from the root layout that calls an idempotent `completeIfExpired()` each tick and owns chime/notification/auto-advance. Remove page-level duplication.
- **Regression test:** Mount a non-timer route with an expired `RUNNING` session under fake timers; assert exactly one completion/history record and one notification.
- **Effort:** M

## TIM-03 — “Start New Session” silently discards a live session

- **Severity:** Critical
- **Status:** CONFIRMED
- **Files:** `src/components/dashboard/RailCards.tsx:250-282` (bug at 273-276); `src/stores/pomodoro-store.ts:347-361`
- **Root cause:** `StandbyCard` calls `reset()` then `start()`. `reset()` unconditionally replaces the session with idle and neither logs to History nor folds progress into the task. The subsequent `start()` cannot recover the discarded elapsed work.
- **Impact:** One click on the dashboard while a session is running destroys all elapsed time, History evidence, and task credit with no confirmation.
- **Reproduction:** Start a 20m focus → click “Start New Session” in the Standby card → check History and task totals; nothing was recorded for the 20m.
- **Fix:** Remove `reset()`; let `start()` preempt/log. Make `reset()` refuse when `RUNNING`/`PAUSED` (or require a confirm + `handleCancel`).
- **Regression test:** Store test: start session → invoke Standby action → assert exactly one CANCELLED record and task `focusedMs` preserved.
- **Effort:** S

## TIM-04 — Break time is counted as focused time

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/hooks/useFinishSession.ts:45-47,81-97,129-159`; `src/components/history/HistoryClient.tsx:154-162`; `src/stores/task-store.ts:502-553`; `src/components/dashboard/InfiniteFocusCard.tsx:58-66`
- **Root cause:** Break sessions are logged with `focusedMs = getElapsedFocusMs(...)` and `breakMs = 0`. History totals every session regardless of `phase`. `preserveActiveProgress` has no phase check, so switching/starting during a break credits break elapsed as task focus.
- **Impact:** Day totals, per-task rows, quick-session rows, efficiency, and task progress include rest time; Dashboard (which filters breaks) disagrees with History.
- **Reproduction:** Finish a focus, run a 10-minute break, then switch tasks or open History. The break appears as 10 focused minutes and may add 10 minutes to the task.
- **Fix:** For break phases write `focusedMs: 0` and real `breakMs`; filter History totals/rows to `phase === "FOCUS"`; branch `preserveActiveProgress` on phase.
- **Regression test:** Extract `buildHistoryGroups`; a day with focus+break must total focus only. `switchToTask` during a break must not change `focusedMs`.
- **Effort:** S

## TIM-05 — `breakMs` is never populated

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/hooks/useFinishSession.ts:45-46,129`; `src/stores/pomodoro-store.ts:207,399`; `src/stores/task-store.ts:515`; consumers `TaskDetails.tsx:405,495`, `SessionInspector.tsx:149-151`, `dashboard-stats.ts:159`
- **Root cause:** Every write path hard-codes `breakMs: 0`. Only tests inject non-zero values.
- **Impact:** “Break time” in Task Details/History is permanently 0; SessionInspector mislabels paused time as break time.
- **Reproduction:** Complete a 5-minute break → inspect task and session record; `breakMs === 0`.
- **Fix:** Accumulate break elapsed into the linked task and the break record on completion/cancel; define whether it attaches to the break record or the next focus.
- **Regression test:** Complete a 5m break → assert task `breakMs === 5*60000` and the break record `breakMs > 0`.
- **Effort:** M

## TIM-06 — Preemption cancels live focus without folding progress into the task

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/stores/pomodoro-store.ts:186-214`; callers `:226-240` (`start`), `:411-436` (`startBreak`); `DesktopBridge.tsx:77-87`; tray producer `src-tauri/src/lib.rs:464-472`
- **Root cause:** `preemptIfActive()` logs CANCELLED History but never calls `preserveActiveProgress`/task credit. `switchToTask`/QuickFocus preserve first; tray “Skip to break”, direct `startBreak`/`start`, and direct `/break` do not.
- **Impact:** History shows elapsed work but task `focusedMs`/`focusedMinutes`/interruptions stay stale, so task progress and Dashboard diverge.
- **Reproduction:** Start a task focus 20m → tray “Skip to break” → History has a CANCELLED 20m focus but the task gained 0 minutes.
- **Fix:** Make preemption always preserve first, or return the cancelled snapshot and require the caller to fold it in. Fix tray skip semantics separately (`DESK-12`).
- **Regression test:** `startBreak()` during a 20m task focus → task gains 20m and exactly one CANCELLED record exists.
- **Effort:** S

## TIM-07 — Finish actions are non-atomic; a second invocation duplicates history/task credit

- **Severity:** High
- **Status:** CONFIRMED (traceable; requires interleaved invocations)
- **Files:** `src/hooks/useFinishSession.ts:37-98,121-161`; `src/stores/pomodoro-store.ts:337-345`
- **Root cause:** `handleComplete`/`handleCancel` compute a snapshot from the render-time session, separately call the store action, then log/credit from the stale snapshot. If another session started in between, `complete()`/`cancel()` transitions the new session while the old snapshot is logged again.
- **Impact:** Duplicate History rows and double task credit/interruptions for the same run; effects can also throw on an already-terminal store state.
- **Reproduction:** Capture `handleComplete`; complete run 1 with auto-start enabled; call the same handler again before re-render → run 1 logged twice.
- **Fix:** One atomic store finalize operation that returns the finalized snapshot and rejects if already terminal; log/credit only from the returned snapshot; per-run finalized guard.
- **Regression test:** Two handler calls with a new session started between them → one record for run 1, zero duplicate credit.
- **Effort:** M

## TIM-08 — `autoStartFocus` uses workspace defaults instead of the task's next slice

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/hooks/useFinishSession.ts:110-115`; `src/stores/pomodoro-store.ts:226-240`; slice logic `src/lib/task-planning.ts:65-79`
- **Root cause:** After a break, auto-start calls `start("FOCUS")`, which uses `config.focusMs` and keeps `activeTaskId`, bypassing `switchToTask`/`nextSliceMinutes`.
- **Impact:** A 25m task runs a 50m block; the final partial block is ignored; “Pomodoro N” accounting and plans drift.
- **Reproduction:** Task 145m with 25m focus, `autoStartFocus` on → after break, `plannedMs === 50*60000`.
- **Fix:** When a task is active, auto-start via `switchToTask(activeTaskId)`; fall back to `start("FOCUS")` only without a task.
- **Regression test:** Auto-start after break on a 25m task → `plannedMs === 25*60000` and correct plan index.
- **Effort:** S

## TIM-09 — No cross-tab coordination: parallel timers and lost writes

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/stores/pomodoro-store.ts:176-486`; `src/stores/task-store.ts:276-641`; `src/stores/session-history-store.ts:77-110`; only `persist.rehydrate()` call is `MiniTimer.tsx:101`
- **Root cause:** Zustand persist has no `storage`/`BroadcastChannel` listener. Each tab owns an in-memory copy and writes the whole persisted object. The single-active invariant is per store instance.
- **Impact:** Two tabs can run concurrent timers; the later `logSession` overwrites the other tab's array, so one record disappears on reload. Same for tasks/progress.
- **Reproduction:** Open two tabs → start a focus in each → complete both → reload; only one new history record survives.
- **Fix:** Add `storage`/BroadcastChannel reconciliation, union sessions by id, and a leader/tab lock for the active timer; at minimum merge on write.
- **Regression test:** Two store instances sharing mocked storage → both sessions survive; only one timer can start.
- **Effort:** L

## TIM-10 — Focus can start on COMPLETED/CANCELLED tasks and keep accruing

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/components/tasks/TaskDetails.tsx:147-156`; `src/stores/task-store.ts:555-604`; status rule `:261`
- **Root cause:** “Focus Now” has no status guard; `withProgressApplied` only promotes TODO→IN_PROGRESS, so terminal tasks stay terminal while totals grow.
- **Impact:** Completed tasks gain minutes; CANCELLED tasks can accrue work; plan counters disagree.
- **Reproduction:** Mark a task COMPLETED → Focus Now → finish 10m → task remains COMPLETED but `focusedMs` increases.
- **Fix:** Refuse focus on terminal tasks or explicitly reopen; stop/detach the timer when marking the live task complete/cancelled.
- **Regression test:** Focus Now on COMPLETED is disabled or reopens the task; completing focus never changes a CANCELLED task’s totals.
- **Effort:** S

## TIM-11 — TaskDetails cannot resume a paused session

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/components/tasks/TaskDetails.tsx:536-538,758-773`
- **Root cause:** The button icon switches to Play when `PAUSED`, but `onClick` always calls `pause()`; the store ignores invalid transitions.
- **Impact:** Pause/resume dead end from Task Details.
- **Reproduction:** Start focus → open Task Details → Pause → click Play → remains PAUSED.
- **Fix:** `status === "PAUSED" ? resume : pause`; update title/aria-label.
- **Regression test:** Paused + Play → `RUNNING`.
- **Effort:** S

## TIM-12 — Infinite Focus can enter a break; reset can target the wrong task

- **Severity:** Medium
- **Status:** CONFIRMED (break path) / HYPOTHESIS (reset edge)
- **Files:** `src/components/dashboard/FocusSessionCard.tsx:186-206,237-266`; `src/components/pomodoro/BreakView.tsx:112-146`; `CompleteView.tsx:99-109` (correctly excludes infinite)
- **Root cause:** `startPrimary` calls `startBreak()` for any completed FOCUS, including Infinite; BreakView also offers a ready break. `doResetInfinite` falls back to `displayTask` when `activeTaskId` is null.
- **Impact:** Contradicts “Infinite has no break”; a reset can zero an unrelated task.
- **Reproduction:** Complete an Infinite focus → click “Start break” on the dashboard.
- **Fix:** Gate breaks on `!isInfinite` in both paths; require an exact `activeTaskId` for reset.
- **Regression test:** Completed Infinite + Start Break → no break; reset with null task id → no task modified.
- **Effort:** S

## TIM-13 — CompleteView “Start Next Focus” can be swallowed by an auto-started break

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/components/pomodoro/CompleteView.tsx:318-325`; `src/stores/task-store.ts:555-561`
- **Root cause:** With `autoStartBreaks`, `handleComplete` starts a break on the same task; `switchToTask` returns early when the live session already belongs to that task.
- **Impact:** The user lands in Focus Mode with a break still running; no next focus starts.
- **Reproduction:** Enable auto-start breaks → complete focus → on `/complete` click “Start Next Focus” → break continues.
- **Fix:** If the live session is a break on the same task, explicitly transition to the next focus slice.
- **Regression test:** Auto-break RUNNING + `switchToTask(T)` from CompleteView → FOCUS on T.
- **Effort:** S

## TIM-14 — Clock rollback makes Pause/Resume silently no-op

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `src/lib/pomodoro-machine.ts:103-104,120-121`; `src/stores/pomodoro-store.ts:315-335`
- **Root cause:** Transitions throw when `now < startedAt`/`pausedAt`; the store swallows all errors.
- **Impact:** After NTP/manual rollback, buttons appear dead with no feedback.
- **Fix:** Clamp effective now or use a monotonic transition clock; surface an error instead of silent ignore.
- **Regression test:** Pause with a clock behind `startedAt` → succeeds with clamped elapsed or visible error.
- **Effort:** S

## TIM-15 — `quickLabel` survives break/auto-focus starts

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `src/stores/pomodoro-store.ts:226-240,411-436`; consumer `FocusSessionCard.tsx:100`
- **Root cause:** `start()`/`startBreak()` set `focusMode`/`sessionName` but never clear `quickLabel`.
- **Impact:** Non-quick sessions show a “Quick” badge and are treated as quick.
- **Fix:** Clear `quickLabel` in non-`startQuick` transitions and on reset.
- **Regression test:** Quick → auto break/focus → `quickLabel === null`.
- **Effort:** S

## TIM-16 — Completion routing race between `/complete` and `/break`

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `FocusSessionCard.tsx:71-86,504-511`; `FocusView.tsx:156-165`; `BreakView.tsx:60-63,119-125`
- **Root cause:** Manual “End Session” pushes `/complete`; the completion effect also pushes `/break`; both run for one completion.
- **Impact:** Final screen is timing-dependent; flicker; auto-advance can leave the wrong screen.
- **Fix:** One navigation owner in the supervisor; distinguish manual end vs natural expiry; redirect BreakView when a FOCUS is running.
- **Regression test:** Manual end consistently shows `/complete`; expiry shows `/break`; auto-start shows the new phase.
- **Effort:** S

## TIM-17 — Break cadence and block counters diverge on early completion

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `useFinishSession.ts:68-79`; `pomodoro-store.ts:421-424`; `task-store.ts:252-260,444-460`; UI `FocusSessionCard.tsx:152`, `CompleteView.tsx:83`
- **Root cause:** `completedFocusCount` increments on any completed FOCUS (drives long-break cadence), while `completedPomodoros` derives from floored minutes. Sub-minute/partial work is dropped from task totals but keeps cycle state.
- **Impact:** Four 20-minute early completions can trigger a long break while the UI says 0 blocks; next block index repeats.
- **Fix:** Use one canonical completion metric; carry exact `focusedMs` into tasks; define early-completion rules explicitly.
- **Regression test:** Early complete 20/50m → cycle count and `completedPomodoros` follow the same rule; task ms is exact.
- **Effort:** M

## TIM-18 — Event sync keeps the first 100 events and can drop the terminal event

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `src/lib/sync.ts:162-175`; `src/app/api/sync/route.ts:148-156`
- **Root cause:** Both normalizers use `.slice(0, 100)` from the start.
- **Impact:** Sessions with >100 events can lose COMPLETE/CANCEL; inspector shows an open pause.
- **Fix:** Keep START + first N + terminal event, or compress pauses.
- **Regression test:** 120 events normalize to retain START and terminal event.
- **Effort:** S

## TIM-19 — Infinite-session rename does not update visible titles

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `FocusView.tsx:171-173,562-571`; `pomodoro-store.ts:369-372`; `FocusSessionCard.tsx:112-118`; `InfiniteFocusCard.tsx:120-127`
- **Root cause:** Rename writes `usePomodoroStore.sessionName`, but headers prefer the task’s stored label.
- **Impact:** The user types a name and the UI does not change.
- **Fix:** Make the live `sessionName` authoritative while a session exists, or update the task label too.
- **Regression test:** Rename live → FocusView, dashboard and History all show the new name.
- **Effort:** S

## TIM-20 — BreakView keyboard start uses stale `extraMin`

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `BreakView.tsx:142-152,174-204`
- **Root cause:** The keydown effect omits `extraMin`/`breaks`; the listener closes over an older `startReadyBreak`.
- **Impact:** “+1 min” then Space starts the break without the added minutes.
- **Fix:** Include the deps or read the latest values from refs/functional state.
- **Regression test:** Add minutes → dispatch Space → `plannedMs` includes them.
- **Effort:** S

## TIM-21 — Rerunning an unlinked history session links it to the previous task

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/components/history/SessionInspector.tsx:65-78`; `pomodoro-store.ts:226-240`
- **Root cause:** The unlinked rerun calls `start()` without clearing `activeTaskId`.
- **Impact:** The rerun is credited to whatever task was live.
- **Fix:** `setActiveTask(null)` or start via `startQuick` with no credit.
- **Regression test:** Rerun unlinked while task A live → `activeTaskId === null`, A unchanged.
- **Effort:** S

---

# B. Sync & persistence

## SYNC-01 — Deletions resurrect across devices (no durable tombstones)

- **Severity:** Critical
- **Status:** CONFIRMED
- **Files:** `src/lib/sync.ts:182-269,343-348`; `src/lib/tombstones.ts:71-78`; `src/app/api/sync/route.ts:296-303`; `prisma/schema.prisma` (no tombstone model)
- **Root cause:** Deletion is a one-shot client array; `pruneTombstones()` deletes the only local record; the server keeps no deletion state; `serverState()` returns none. A stale device's next POST recreates the row.
- **Impact:** Deleted tasks/sessions reappear; cleared history can return; deletion never converges.
- **Reproduction:** A and B synced → delete task T on A and sync → sync B (still has T) → T is recreated on the server → sync A → T returns.
- **Fix:** Server-side tombstone/soft-delete (`id,userId,deletedAt`), written transactionally, returned by `serverState()`, merged on every pull; prune client tombstones only after server confirmation.
- **Regression test:** A server tombstone removes the local row and keeps it removed after a stale device pushes it.
- **Effort:** L

## SYNC-02 — Task LWW compares client and server clocks; skewed edits are lost

- **Severity:** High
- **Status:** CONFIRMED (depends on documented Prisma `@updatedAt`)
- **Files:** `prisma/schema.prisma:111`; `src/app/api/sync/route.ts:309-332`; `src/lib/sync.ts:92-140,182-229`
- **Root cause:** The server stores only its own `updatedAt`; after a round-trip the client adopts it. A client with a slower clock sends a lower timestamp; the server skips the write and returns the old row, which then overwrites the edit locally.
- **Impact:** Edits silently revert; no conflict UI.
- **Reproduction:** Sync T → set device B 10 minutes slow → edit T on B → sync → old content wins.
- **Fix:** Persist a client-authoritative `clientUpdatedAt` on Task and use it for LWW on both sides; store client `createdAt`.
- **Regression test:** Push a timestamp older than server but newer than the last client edit → edit retained.
- **Effort:** M

## SYNC-03 — Remote live state can erase a running session without logging it

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/lib/live-sync.ts:112-115,199-216`; `src/lib/sync.ts:335-339`; `src/app/api/sync/route.ts:471-495`
- **Root cause:** `shouldApplyLive` is a pure client-clock comparison; `applyRemoteLive` replaces the whole local live session with no archive step.
- **Impact:** Device A's elapsed focus disappears with no History/task credit when device B starts a newer session.
- **Reproduction:** Focus 10m on A → start any session on B → sync A → A switches to B's state; A's 10m is unlogged.
- **Fix:** Finalize a local RUNNING/PAUSED run before applying a different live session id, or refuse and reconcile; use a monotonic server sequence.
- **Regression test:** Newer remote live while local is RUNNING → local run archived and not silently discarded.
- **Effort:** M

## SYNC-04 — Settings sync payload uses the wrong field name; settings stop syncing

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/lib/settings-sync.ts:125` (`updatedAt`); `src/lib/sync.ts:388` (`settings: collectLocalSettings()`); `src/app/api/sync/route.ts:444-469` (`rawSettings.clientUpdatedAt`)
- **Root cause:** Producer emits `updatedAt`; consumer reads `clientUpdatedAt`. The stored value is always 0, so subsequent writes are rejected and remote `updatedAt` is 0.
- **Impact:** Timer style, chime, ambient selection, review prompts, diversions never sync between devices; the row is effectively create-only.
- **Reproduction:** Change a setting on A → sync → sync B → B's setting unchanged. Inspect `/api/sync`: `settings.clientUpdatedAt === 0`.
- **Fix:** Send `clientUpdatedAt`, or accept `updatedAt`; add a shared payload contract type; backfill existing rows.
- **Regression test:** Contract test builds the POST body and asserts the mapper stores the timestamp; two-store integration sync.
- **Effort:** S

## SYNC-05 — Clearing history cannot remove server records beyond the client cap

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/stores/session-history-store.ts:90,100-103`; `src/lib/sync.ts:53,231-269`; `src/app/api/sync/route.ts:230-234`
- **Root cause:** Client keeps 500, server returns 1000. Clear tombstones only the loaded 500; older records return on the next pull.
- **Impact:** “Clear history” is not durable; older sessions reappear.
- **Fix:** Server-side clear-all/`clearedBefore` per user, or tombstone all server ids before clearing; align caps/paginate.
- **Regression test:** Server with 700 sessions, client with 500 → clear → pull returns none.
- **Effort:** M

## SYNC-06 — Server session tie-break overwrites equal-`endedAt` corrections; event replacement is not transactional

- **Severity:** Low/Medium
- **Status:** CONFIRMED
- **Files:** `src/app/api/sync/route.ts:390-441`; client tie-break `src/lib/sync.ts:249-263`
- **Root cause:** Server skips only when `existing > incoming`; on equal `endedAt` a stale lower `focusedMs` overwrites. Update does `deleteMany(events)` then `updateMany` without a transaction.
- **Impact:** Lost corrections and permanently missing audit events on partial failure.
- **Fix:** Mirror the client tie-break or store a version; wrap update+events in `$transaction`.
- **Regression test:** Equal `endedAt`, lower `focusedMs` → not overwritten; simulated event-create failure leaves old events.
- **Effort:** S

## SYNC-07 — In-flight sync drops debounced pushes

- **Severity:** Low/Medium
- **Status:** CONFIRMED
- **Files:** `src/lib/sync.ts:283-294,372-376,400-405`
- **Root cause:** `schedulePush` clears the timer, then `syncNow` returns early when `syncing` and sets no pending flag.
- **Impact:** A mutation during a slow sync waits for the 30s/90s loop, or is lost if the tab closes.
- **Fix:** Set a pending flag and flush after the current sync.
- **Regression test:** Delayed sync + edit → a follow-up push includes the edit.
- **Effort:** S

## SYNC-08 — Duplicate calendar-event collapse keeps the least complete task

- **Severity:** Low/Medium
- **Status:** CONFIRMED
- **Files:** `src/lib/sync.ts:201-224`; `src/app/api/sync/route.ts:340-352`
- **Root cause:** Dedup sorts by `createdAt` and keeps the earliest without merging progress.
- **Impact:** Focused time/subtasks/status on the newer duplicate are lost.
- **Fix:** Merge progress before dedupe or keep the most-complete/newest row.
- **Regression test:** Duplicate event ids with different progress → survivor keeps max focused time and newer status.
- **Effort:** M

## SYNC-09 — Persisted-store hydration mismatch risk

- **Severity:** Medium
- **Status:** HYPOTHESIS (high confidence)
- **Files:** `pomodoro-store.ts:176-177,453-456`; `task-store.ts:276-277,609-613`; `session-history-store.ts:77-79`; `DashboardHome.tsx:23-37`; `TasksPage.tsx:32-46`; only `FocusSessionCard.tsx:45,66` gates on mount
- **Root cause:** Zustand persist rehydrates synchronously on the client, while server markup was built from empty stores. Most pages read store data on first render.
- **Impact:** Hydration warnings, discarded server HTML, flicker, extra first-load work for returning users.
- **Fix:** `skipHydration` + root rehydrate, or render a skeleton until `persist.hasHydrated()`.
- **Regression test:** Playwright console scan for hydration warnings with seeded localStorage.
- **Effort:** M

---

# C. Desktop reliability

## DESK-01 — Desktop sign-in event can fire before the JS listener exists

- **Severity:** High
- **Status:** CONFIRMED (race) / timing-dependent
- **Files:** `src/stores/desktop-auth-store.ts:110-117`; `src-tauri/src/lib.rs:201-269`
- **Root cause:** `signIn()` awaits `start_desktop_auth`, which opens the browser; only then does `waitForRedirect` register the Tauri listener. An already-signed-in browser can complete the loopback before the listener exists; events are not retained.
- **Impact:** The browser says success but the app waits 5 minutes and times out.
- **Reproduction:** Sign into the web app → desktop “Sign in with Google” → browser immediately returns success → app hangs.
- **Fix:** Register the listener before invoking start, or store the result in Rust and poll/take it; add a ready handshake.
- **Regression test:** Repeat sign-in 20× while already signed in; no timeout. Slow/fast browser both deliver the result.
- **Effort:** S

## DESK-02 — Hidden-to-tray timers depend on JS; `backgroundThrottling` is unsupported on Windows

- **Severity:** High
- **Status:** CONFIRMED config / HYPOTHESIS runtime
- **Files:** `src-tauri/tauri.conf.json:26`; Tauri docs: `backgroundThrottling` is unsupported on Linux/Windows/Android; `DesktopBridge.tsx:72-166`; `src-tauri/src/lib.rs:517-525`
- **Root cause:** Completion, tray tooltip, taskbar progress, idle pause, and block clearing are JS timers in the main webview. On Windows the disabling option is a no-op, and WebView2 may throttle/suspend hidden views.
- **Impact:** Closing to the tray (the primary desktop flow) may stop completion/notification/block-clearing until the window is shown again.
- **Reproduction:** Start a short timer → close to tray → wait past expiry → observe no native notification and a stale tooltip; reopen to see late completion.
- **Fix:** Move time-critical work to Rust (schedule a timer, emit completion/notification), or keep a verified WebLock/heartbeat; at minimum detect suspension and reconcile on wake.
- **Regression test:** Hidden-to-tray run past expiry on Windows; notification/history/break/block-clear happen without reopening. Repeat minimized and after sleep.
- **Effort:** M/L

## DESK-03 — Focus Guard cleanup incomplete on helper removal/uninstall

- **Severity:** Medium/High
- **Status:** CONFIRMED
- **Files:** `src-tauri/src/blocking.rs:236-242`; `settings/page.tsx:375-386`; `blocking.rs:246-257`; `src-tauri/src/lib.rs:528-533`; `tauri.conf.json:47-52` (no NSIS hooks)
- **Root cause:** `remove_helper` deletes `C:\ProgramData\Tempo` and unregisters the task without clearing the hosts block first; uninstall has no cleanup hooks.
- **Impact:** Sites stay blocked machine-wide after removal/uninstall; stale elevated scheduled task remains.
- **Fix:** Clear the block before removing the helper; add NSIS install/uninstall hooks to clear hosts, unregister `TempoBlock`, remove ProgramData.
- **Regression test:** Remove helper during a block → hosts cleared; uninstall → task/ProgramData/hosts clean.
- **Effort:** M

## DESK-04 — Elevated helper uses a predictable temp script and unquoted paths

- **Severity:** High (security) / Medium (reliability)
- **Status:** CONFIRMED pattern / HYPOTHESIS exploit
- **Files:** `src-tauri/src/blocking.rs:147-168`
- **Root cause:** `%TEMP%\tempo-helper.ps1` is user-writable and executed elevated after a non-atomic write; `Start-Process -ArgumentList` does not quote, and the path is embedded in a single-quoted PowerShell string.
- **Impact:** Local privilege escalation via TOCTOU (hypothesis); Focus Guard install fails for usernames/paths with spaces or apostrophes (confirmed reliability).
- **Reproduction (reliability):** Run under `C:\Users\John Smith\...` or `O'Brien` → helper install fails.
- **Fix:** Use `-EncodedCommand`, a random ACL-protected file, or a signed helper binary; quote/escape paths; delete the temp file in `finally`.
- **Regression test:** Space/apostrophe profile installs; tamper between write/UAC is rejected; no temp script remains.
- **Effort:** M

## DESK-05 — No auto-updater

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src-tauri/Cargo.toml:20-32`; `tauri.conf.json:33-53`; `README.md:254-261`; `src/lib/downloads.ts:8-10`
- **Root cause:** No updater plugin/endpoint/pubkey; users must download and reinstall an unsigned installer.
- **Impact:** Users never learn about security fixes; SmartScreen friction; no update verification beyond HTTPS/GitHub.
- **Fix:** Add `tauri-plugin-updater` with a signed manifest, background checks, and signed installers; add an in-app “Check for updates”.
- **Regression test:** Old version detects and installs a new signed release; tampered update rejected; local data survives.
- **Effort:** L

## DESK-06 — Desktop build script can permanently delete source if interrupted

- **Severity:** High (developer/repo integrity)
- **Status:** CONFIRMED
- **Files:** `scripts/build-desktop.mjs:22-34,39-65` (critical: `:40`, `:56-65`)
- **Root cause:** Sources are `renameSync`'d into `.desktop-exclude`; on kill the `finally` may not run; the next run deletes staging before restoring.
- **Impact:** Uncommitted `src/app/api` and dynamic routes can be lost.
- **Reproduction:** Kill `npm run build:desktop` mid-build → `src/app/api` missing → run again → staging deleted.
- **Fix:** Never move source; build from a temp copy/worktree, or refuse to delete staging and restore first; add signal handlers/lock.
- **Regression test:** Kill mid-build → rerun does not delete source; `git status` clean after a normal build.
- **Effort:** S

## DESK-07 — Global shortcut failure is silent in release

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src-tauri/src/lib.rs:507-513,394-401`
- **Root cause:** Registration failure is only `log::warn!`; the logger is initialized only in debug. Settings advertises “5 Global Hotkeys” though only one is OS-global.
- **Impact:** Hotkey silently doesn’t work; misleading settings copy.
- **Fix:** Initialize a release warning logger, surface failure in UI, make the shortcut configurable/retry; fix copy.
- **Regression test:** Occupy Ctrl+Shift+Space → visible warning + tray fallback.
- **Effort:** S

## DESK-08 — Mini window is created at startup on the primary monitor; failure aborts startup

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src-tauri/src/lib.rs:403,45-76,49-58`
- **Root cause:** Hidden mini is built synchronously in `setup` with `?`; position uses `primary_monitor()` only.
- **Impact:** Second full webview at launch (memory/CPU), possible startup panic if creation fails, wrong monitor on multi-monitor setups, position resets each launch.
- **Fix:** Create lazily on first toggle with error logging; choose the main window’s monitor/work area and persist position.
- **Regression test:** Launch without mini → one webview; toggle creates it; failure still opens main; multi-monitor/DPI placement correct.
- **Effort:** S/M

## DESK-09 — Tray/hotkey hides a visible-but-unfocused or minimized window

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `src-tauri/src/lib.rs:34-42,495-504`
- **Root cause:** `toggle_main` only checks `is_visible()`.
- **Impact:** One action hides instead of focusing; inconsistent hotkey behavior.
- **Fix:** Distinguish hidden/minimized/focused states.
- **Regression test:** Covered, minimized, hidden, focused → each yields the expected action.
- **Effort:** S

## DESK-10 — Focus Guard apply/clear race leaves sites blocked

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `DesktopBridge.tsx:108-144`
- **Root cause:** `blockBusy`/`blockApplied` are set before async apply resolves; a pause during elevation is ignored; domain edits mid-focus are not reapplied.
- **Impact:** Sites remain blocked after the session stops; new domains wait until the next start.
- **Fix:** Queue operations and recompute `want` after each completion; set applied only on success; reconcile periodically.
- **Regression test:** Pause during UAC → block cleared after apply; mid-focus domain edit applies; failures retry.
- **Effort:** S

## DESK-11 — Stale service-worker repair can fail to reload

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `ServiceWorkerRegister.tsx:13-22`; `src-tauri/src/lib.rs:323-343`; `public/sw.js`
- **Root cause:** React unregisters within ~1s; Rust checks `regs.length > 0` at ~2s and may skip reload. React deletes caches without reloading.
- **Impact:** First launch after upgrade can run the old bundle; lazy chunks may 404.
- **Fix:** Always reload once after clearing (guarded against loops); use a single repair path.
- **Regression test:** Upgrade from a cached version → one reload into the new bundle; no loop when no SW.
- **Effort:** S

## DESK-12 — Tray “Skip to break” has inverted/incorrect semantics

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src-tauri/src/lib.rs:476-482`; `DesktopBridge.tsx:84-86`; `pomodoro-store.ts:411-436`
- **Root cause:** Always calls `startBreak()`. During focus it cancels (not completes); while idle it starts a break; during a break it starts a focus. Menu is always enabled.
- **Impact:** History/task credit wrong; action does the opposite of its label in two states.
- **Fix:** Explicit commands per state; enable/disable/relabel by live phase; decide early-end credit policy.
- **Regression test:** Tray action from focus/paused/break/idle → correct phase and credit.
- **Effort:** S/M

---

# D. UX, accessibility & flows

## UX-01 — History counts breaks as focus (see TIM-04)

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `HistoryClient.tsx:154-162`; confirms `totalMs += s.focusedMs` for every phase.
- **Fix/test:** Filter to FOCUS; extract and test `buildHistoryGroups`.

## UX-02 — Advertised keyboard shortcuts are dead or misleading

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `FocusView.tsx:280-314,653-657`; `TopBar.tsx:27-35`; `GlobalShortcuts.tsx:10-22`
- **Root cause:** “End Block ⌘E” has no `KeyE` branch and the handler returns on modifiers; “Search tasks ⌘K” routes to `/tasks` without focusing search; only `/` focuses it.
- **Impact:** Advertised controls do nothing or land on an unfiltered list.
- **Fix:** Implement `KeyE`; make ⌘K focus the search ref; correct copy.
- **Regression test:** ⌘E ends block; ⌘K focuses search; `/` still works.
- **Effort:** S

## UX-03 — Every guest sees the owner's name and portrait

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `DashboardHeader.tsx:24-28`; `TaskDetails.tsx:737-742`; `assets.ts:2-3`
- **Root cause:** Fallback name hardcoded to `"Neeraj"`; fallback avatar is the owner's 1.38 MB portrait.
- **Impact:** Privacy/identity leak and inconsistent “Guest” state.
- **Fix:** “Guest”/neutral avatar; only use personal image from the session.
- **Regression test:** Unauthenticated render contains no “Neeraj” and no personal asset.
- **Effort:** S

## UX-04 — Settings contains dead/fake controls and copy mismatch

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `settings/page.tsx:255,402,458-471`
- **Root cause:** Light Mode is a static selected card; “Custom” duration is read-only; review copy says 18:30 but code uses `hours >= 18`.
- **Impact:** Dead ends and untrustworthy settings.
- **Fix:** Implement or remove/label “coming soon”; align copy.
- **Regression test:** Custom duration updates config; theme control either works or is absent; copy matches code.
- **Effort:** S/M

## UX-05 — Day planner is disconnected from calendar data and doesn't persist

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `DayPlanner.tsx:68-110`; `app/plan/page.tsx`
- **Root cause:** `busy` is permanently `[]`; generated blocks live only in component state; “Start first focus” pushes `/` not `/focus`.
- **Impact:** Conflict detection is dead; plans vanish on navigation; user lands on the wrong screen.
- **Fix:** Wire busy events, persist plans, push `/focus`.
- **Regression test:** Busy event excluded; plan survives remount; start navigates to `/focus`.
- **Effort:** M/L

## UX-06 — TaskDetails delete has no confirmation; paused Play button broken (see TIM-11)

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `TaskDetails.tsx:356-367` (delete), `:536-538` (play/pause)
- **Impact:** Accidental permanent deletion; resume dead end.
- **Fix:** ConfirmDialog for delete; correct toggle handler.
- **Effort:** S

## UX-07 — Task row “more” menu is clipped

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `TasksPage.tsx:254,299,322`; `TaskTable.tsx:286-320`
- **Root cause:** Menu is absolutely positioned inside `overflow-hidden` group containers.
- **Impact:** Edit/Complete/Cancel/Delete unreachable for rows near the bottom.
- **Fix:** Portal/popover with collision detection.
- **Regression test:** Last row’s menu fully visible/clickable.
- **Effort:** S

## UX-08 — History is capped and session details are unreachable

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `session-history-store.ts:90`; `sync.ts:53`; `HistoryClient.tsx:120-221`; `SessionInspector.tsx:36-46`
- **Root cause:** 500-record cap; aggregates only; quick rows are non-clickable divs; `sessionHref` used only from TaskDetails.
- **Impact:** “All time” silently hides older sessions; users cannot inspect most sessions.
- **Fix:** Cursor pagination, retention messaging, link rows to SessionInspector.
- **Regression test:** 600 sessions → pagination/clear message; quick row navigates.
- **Effort:** M

## UX-09 — Accessibility cluster

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files (representative):** `NewTaskModal.tsx:112-126,169-191`; `AppChrome.tsx:29-40`; `FocusView.tsx:375-379,509,575-580`; `BreakView.tsx:244,328`; `CompleteView.tsx:129,174`; `login/page.tsx:96,126`; `settings/page.tsx:26-46,206-220,359`; `ConfirmDialog.tsx:92-98`; `QuickFocusCard.tsx:100`; `TasksPage.tsx:161-187`; `LibraryPage.tsx:233-254`; `HistoryClient.tsx:271-285`; `TaskDetails.tsx:662-671`
- **Root cause:** NewTaskModal has `role="dialog"` but no focus trap/restore and unlabeled close; full-screen routes render inside the normal shell, leaving nav tabbable and adding a second `<main>`; inputs rely on placeholders; labels not associated; toggles use `focus:outline-none` without a ring; `text-on-error` is undefined; destructive button contrast ~2.74:1; placeholders ~3.0–3.6:1; segmented controls lack `aria-selected/pressed`; mobile delete is hover-only; no `aria-live` for timer/status/errors.
- **Impact:** Keyboard/screen-reader users cannot operate core flows; touch users cannot delete subtasks; status changes are silent.
- **Fix:** Focus trap/restore, `aria-*`, `htmlFor`/`id`, focus-visible rings, contrast tokens, `inert` background for overlays, avoid nested `<main>`, visible mobile actions, live regions.
- **Regression test:** axe Playwright scan; keyboard e2e for modal and overlay routes; contrast token test.
- **Effort:** M

## UX-10 — Sign-out deletes local data before confirming

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `auth-actions.ts:28-39`
- **Root cause:** `clearLocalTempoData()` runs before `signOut`; no sync/unsaved check.
- **Impact:** Offline/unsynced tasks, history, notes and settings are permanently lost on sign-out.
- **Fix:** Prompt when unsynced; try sync first; preserve a backup.
- **Regression test:** Failed/offline sync + sign-out → confirmation/preserved data.
- **Effort:** S/M

## UX-11 — Sync failures are only visible in Settings

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `sync-store.ts:14-25`; `settings/page.tsx:74-76`
- **Impact:** Cross-device backup can fail silently for days.
- **Fix:** Global sync indicator/banner with retry and re-auth.
- **Regression test:** Failed sync → visible error/retry; 401 → re-auth prompt.
- **Effort:** S

## UX-12 — Date rollover, DST and stale “starts in” labels

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `DashboardHome.tsx:30-53`; `TasksPage.tsx:65,101-110`; `HistoryClient.tsx:47-52`; `ScheduleList.tsx:26-31,55`; `TaskDetails.tsx:143-145`
- **Root cause:** `todayKey()`/`Date.now()` computed once per render; `now - 86_400_000` used for yesterday; ScheduleList `now` is static; due labels compare weekdays.
- **Impact:** Overnight the app keeps yesterday's data; DST days are wrong; “starts in” never counts down; same weekday next week labeled today.
- **Fix:** Shared minute/midnight clock; `setDate(getDate()-1)`; date-key comparisons.
- **Regression test:** Fake timers across midnight and DST.
- **Effort:** S

## UX-13 — Break/Complete screens show stale or wrong labels

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `BreakView.tsx:72-78,400-409,449-470`; `CompleteView.tsx:27-33,77,97,301-315`; `SessionInspector.tsx:65-78`
- **Root cause:** All-time fallback for “last focus”; paused primary says “Start Break”; CompleteView always shows short-break length and forces sub-minute to “1m”; rerun ignores planned duration.
- **Fix:** Today-only, correct labels, compute due break phase, preserve `plannedMs`.
- **Effort:** S

## UX-14 — Login hides auth errors and makes unsupported claims

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `login/page.tsx:55-93,179,238-267`; `desktop-auth-store.ts:48-71`
- **Root cause:** `?error=` ignored; hardcoded “Tempo Technologies Inc.”, “v2.4”, “All systems operational”, “AES-256 Encrypted”; desktop wait has no cancel.
- **Fix:** Show NextAuth errors; remove/qualify claims; add cancel/timeout UI.
- **Effort:** S

## UX-15 — Desktop first paint is an empty shell

- **Severity:** Low/Medium
- **Status:** CONFIRMED
- **Files:** `out/index.html`; `AppChrome.tsx:19-27`
- **Root cause:** Desktop starts `mini = null` and renders only an empty surface until JS runs.
- **Impact:** Blank dark frame at cold start; a missing chunk leaves a blank app.
- **Fix:** Render the main shell by default and suppress only in a dedicated mini entry, or use a pre-hydration flag; add a static fallback.
- **Effort:** S/M

---

# E. Architecture & maintainability

## ARCH-01 — Duplicated completion/expiry logic across three views

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `FocusSessionCard.tsx:71-86`; `FocusView.tsx:150-165`; `BreakView.tsx:60-63`
- **Impact:** Behavior drifts (different navigation, auto-advance handling); easy to add a route without completion.
- **Fix:** Single supervisor/state machine hook; views subscribe to results.
- **Effort:** M

## ARCH-02 — Two persistence models (local stores + direct server sync) with no contract

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/lib/sync.ts`, `src/lib/settings-sync.ts`, `src/lib/live-sync.ts`, `src/app/api/sync/route.ts`
- **Impact:** The settings field-name mismatch (`SYNC-04`) is a direct consequence; caps and merge rules are duplicated and inconsistent.
- **Fix:** Shared typed payload contracts, one merge module, schema validation.
- **Effort:** M

## ARCH-03 — Task/session ID and timestamp ownership is split between client and server

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `api/sync/route.ts:95,131`; `task-store.ts`; `session-history-store.ts`
- **Impact:** LWW/clock issues, duplicate ids, 500s on collisions.
- **Fix:** Server-owned IDs or validated client IDs; client timestamp columns.
- **Effort:** M

## ARCH-04 — Legacy `/api/tasks` and `/api/sessions` duplicate `/api/sync` with different semantics

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/app/api/tasks/route.ts:44-53` (planned vs focused minutes); `src/app/api/sessions/route.ts:74-109` (no single-active check)
- **Impact:** Inconsistent numbers and invariants if any consumer uses them.
- **Fix:** Remove or reimplement on the shared sync/domain layer.
- **Effort:** S/M

---

# F. Testing gaps

## TEST-01 — No sync/API contract or integration tests

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `vitest.config.ts:4-8`; `src/lib/__tests__/sync.test.ts` (pure helpers only)
- **Impact:** `SYNC-04` shipped despite 130 green tests; sync regressions are invisible.
- **Fix:** Shared contract tests, route handlers with mocked Prisma, two-client integration, 401/tombstone tests.
- **Effort:** M/L

## TEST-02 — No component/E2E tests; node env only

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `vitest.config.ts`; `package.json` (no jsdom/Testing Library/Playwright)
- **Impact:** StandbyCard data loss, timer expiry, routing races, modal focus, History break inflation, sign-out loss are all unverified.
- **Fix:** Add jsdom + Testing Library and Playwright; prioritize start→background→complete, StandbyCard while running, History with break, keyboard/modal, offline PWA.
- **Effort:** L

## TEST-03 — No coverage thresholds, CI, or asset budgets

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `vitest.config.ts`; no CI config found
- **Impact:** Regressions and the 4 MB font/7 MB unused assets can return unnoticed.
- **Fix:** `@vitest/coverage-v8` + thresholds, CI workflow, asset/image size checks.
- **Effort:** M

## TEST-04 — Timing/test hygiene

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `src/lib/__tests__/guest.test.ts:34-70`; `src/stores/__tests__/infinite-focus.test.ts`; `src/lib/__tests__/desktop-auth.test.ts:4`
- **Root cause:** Globals mutated without restore; real `Date.now()`; env at module scope.
- **Impact:** Future time-based tests will be flaky.
- **Fix:** Fake timers, `afterEach` restore, reset module singletons.
- **Effort:** S
