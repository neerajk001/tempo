# Tempo — Improvement Roadmap

Companion to `AUDIT_SUMMARY.md`. This is a sequenced, risk-first plan. No application code was changed during the audit; this file describes recommended work only.

## Guiding principles

1. **Data integrity before features.** A Pomodoro app that loses or inflates focus time is worse than one missing a screen.
2. **One owner per responsibility.** One timer supervisor, one completion path, one sync contract, one mini entry point.
3. **Test the failure modes found here.** Every fix ships with a regression test for the exact reproduction.
4. **Security changes are independent and parallelizable.** Start dependency/auth work in week 1 even while timer fixes land.
5. **Small, reversible releases.** Desktop 0.1.1 is already published; use 0.1.2 for the first batch and keep the update path working.

---

## Top 5 issues (from `AUDIT_SUMMARY.md`)

| Rank | Issue | IDs | Effort |
|---|---|---|---|
| 1 | Timer over-credit + completion only on 3 routes | `TIM-01`, `TIM-02`, `DESK-02` | M |
| 2 | StandbyCard destroys a live session | `TIM-03` | S |
| 3 | Sync is lossy/broken (settings, tombstones, LWW, live overwrite) | `SYNC-01`–`SYNC-04` | L |
| 4 | Desktop credential lifecycle + critical Next advisories | `SEC-01`–`SEC-05` | L |
| 5 | Break time counted as focus / `breakMs` never populated | `TIM-04`, `TIM-05`, `TIM-06` | M |

## First 3 fixes

1. **Completion correctness:** clamp allocated completions to `plannedMs`, compute `endedAt` from the plan, and add one root-level `TimerSupervisor`. Ship with a fake-clock test. (`TIM-01`, `TIM-02`)
2. **Stop the bleed:** remove `reset()` from `StandbyCard`; make `reset()` refuse while a session is live; add a store test proving one CANCELLED record and preserved task time. (`TIM-03`)
3. **Truthful accounting + sync contract:** filter History to FOCUS, write real `breakMs`, and fix the settings `updatedAt`/`clientUpdatedAt` mismatch with a shared payload type. (`TIM-04`, `TIM-05`, `SYNC-04`)

---

# Phase 0 — Same-day quick wins (≤ 1 day total)

| Item | Change | IDs | Effort |
|---|---|---|---|
| StandbyCard | Remove `reset()`, rely on `start()` preemption; guard `reset()` when active | TIM-03 | S |
| Settings sync | Send `clientUpdatedAt` (or read `updatedAt`) + shared type | SYNC-04 | S |
| History | Count/group only `phase === "FOCUS"` | TIM-04, UX-01 | S |
| TaskDetails | Correct pause/resume toggle | TIM-11, UX-06 | S |
| Tray skip | Guard by status/phase so it cannot invert the action | DESK-12 | S |
| Completion clamp | `focusedMs ≤ plannedMs` for allocated sessions | TIM-01 (partial) | S |
| Preemption | Preserve task progress before starting a new session | TIM-06 | S |
| Build script | Refuse to delete `.desktop-exclude` if sources are missing | DESK-06 | S |

**Acceptance:** all existing tests plus new store tests pass; manual smoke: start→navigate→return, start→Standby, break→History.

**Release:** 0.1.2 (web + desktop).

---

# Phase 1 — Timer integrity (week 1, ~3–4 dev days)

### 1.1 Global timer supervisor

- Create one `TimerSupervisor` mounted from the root layout (and desktop bridge) that:
  - subscribes to the pomodoro store and a shared clock;
  - calls an idempotent `completeIfExpired(now)` once per tick;
  - owns chime, notification, auto-break/auto-focus, and route/phase transitions;
  - pauses its tick when no session is `RUNNING` (not `PAUSED`).
- Remove the three page-local expiry effects.
- Distinguish **natural expiry** from **manual end** so routing is deterministic.

**Fixes:** `TIM-02`, `TIM-16`, `ARCH-01`.
**Tests:** fake-timer test on a non-timer route; one-and-only-one completion; auto-advance routes correctly; no duplicate history.

### 1.2 Atomic finalize

- Add a store operation `finalizeSession(reason)` that transitions once, returns the finalized snapshot, and rejects terminal states.
- `useFinishSession` logs/credits only from the returned snapshot.
- Add a per-run finalized guard.

**Fixes:** `TIM-07`, `DESK-12` (credit policy).
**Tests:** double invocation with an intervening start yields one record; no double task credit.

### 1.3 Sleep/wake and quit handling

- Persist `lastTickAt`; on restore, if the gap exceeds a threshold, treat it as suspended (pause/cancel with verified elapsed) rather than crediting it.
- On desktop app exit, persist a pause marker.
- For allocated completions, `endedAt = startedAt + totalPausedMs + plannedMs`.
- Decide Infinite policy explicitly (recommend: prompt or treat sleep as paused).

**Fixes:** `TIM-01`, `DESK-02` (partial).
**Tests:** 2-hour fake gap; quit/relaunch; infinite sleep.

### 1.4 Cross-tab safety

- Add a `storage`/BroadcastChannel reconcile and a leader lock for the live timer.
- Merge session arrays on write instead of overwriting.

**Fixes:** `TIM-09`.
**Tests:** two tabs → one timer; both history rows survive.

### 1.5 Correct task accounting

- Phase-aware `preserveActiveProgress` (`focusedMs` only for FOCUS; `breakMs` for breaks).
- One canonical completion metric for `completedFocusCount` vs `completedPomodoros`.
- Auto-start focus through `switchToTask` to use the task slice.

**Fixes:** `TIM-04`, `TIM-05`, `TIM-06`, `TIM-08`, `TIM-17`.
**Tests:** break switch leaves focus unchanged; breakMs populated; auto-start uses 25m slice.

**Release:** 0.1.3. Publish with release notes calling out corrected history totals.

---

# Phase 2 — Sync correctness (week 2, ~4–5 dev days)

### 2.1 Shared contract + validation

- One typed payload contract used by client and route; schema validation (zod or hand-rolled) at the boundary.
- Fix the settings timestamp (`SYNC-04`) and backfill existing rows.
- Cap every string/array/JSON field; reject unknown shapes.

**Fixes:** `SYNC-04`, `SEC-06`, `ARCH-02`.

### 2.2 Durable deletions

- Add a `Tombstone` model (or soft-delete columns) for tasks/sessions; write transitively; return tombstones from `serverState()`; merge on every pull.
- Make “clear history” a server operation/`clearedBefore`.

**Fixes:** `SYNC-01`, `SYNC-05`.
**Tests:** two-device delete convergence; 700→clear→0.

### 2.3 Clock-safe LWW

- Add `clientUpdatedAt` (BigInt) to Task; store and compare it on both sides.
- Mirror the client tie-break on the server; wrap session update + event replacement in `$transaction`.

**Fixes:** `SYNC-02`, `SYNC-06`.
**Tests:** skewed clock edit wins; equal endedAt keeps the richer record; failed event write preserves old events.

### 2.4 Live-state ownership

- Add a per-run id/device id; never replace a different live run without archiving it first.
- Consider a monotonic server sequence instead of client clocks.

**Fixes:** `SYNC-03`, `SYNC-07`.
**Tests:** remote newer live while running → local archived; in-flight push followed by edit → follow-up push.

### 2.5 Incremental sync (performance)

- Cursor-based GET/POST: send only changed rows, return only changed rows; batch writes; paginate history; stop returning all events.

**Fixes:** `PERF-01`.
**Tests:** 500-session load test; unchanged push performs zero writes; response budget.

**Release:** 0.1.4.

---

# Phase 3 — Security (week 3, start in parallel week 1)

### 3.1 Dependency remediation

- Upgrade Next.js to a patched line; align `eslint-config-next`; upgrade Vitest; pin `source-map-js` > 1.2.1.
- Interim: disable `/_next/image` on web if the upgrade is deferred.
- Add `npm audit --audit-level=high` to CI.

**Fixes:** `SEC-01`, `SEC-17`. **Effort:** L (S interim).

### 3.2 Auth protocol hardening

- Require S256 PKCE and state on `/start`; require a verifier on `/exchange`.
- One-time login-token redemption (`jti`); do not put the token in a persistent URL.
- Validate the loopback client/port or use a registered custom scheme.

**Fixes:** `SEC-02`, `SEC-13`, `SEC-14`. **Effort:** M.

### 3.3 Revocable credentials

- Add a server session/token table (`jti`, device, revoked); short-lived access + refresh; sign-out-all.
- Reduce desktop token TTL as an interim.
- Encrypt token at rest (DPAPI/Credential Manager/Stronghold); keep it out of JS; restrict auth commands to `main`.

**Fixes:** `SEC-03`, `SEC-05`, `SEC-15`. **Effort:** L.

### 3.4 Account data isolation

- Owner-tag local data; stop auto-migration on every auth transition; offer Import/Keep/Discard; default “sign out and clear local data” on shared devices.

**Fixes:** `SEC-04`, `SEC-07`. **Effort:** M.

### 3.5 Config + headers

- Reject placeholder/short secrets and non-HTTPS production URLs at startup.
- Require a separate `DESKTOP_AUTH_SECRET`.
- Add CSP (web + Tauri), escape JSON-LD, broaden `.gitignore`.
- Add rate limits/body caps.

**Fixes:** `SEC-08`, `SEC-12`, `SEC-19`, `SEC-06`. **Effort:** M.

**Release:** 0.1.5 (security release; announce).

---

# Phase 4 — Desktop reliability (week 4, ~4 dev days)

| Item | Change | IDs | Effort |
|---|---|---|---|
| Rust completion | Schedule timer/completion/notification in Rust, independent of the hidden webview | DESK-02 | M/L |
| Focus Guard cleanup | Clear block before helper removal; add NSIS install/uninstall hooks | DESK-03 | M |
| Helper hardening | Encoded/random ACL script or signed helper; quote paths | DESK-04, SEC-16 | M |
| Mini entry | Minimal `/mini` entry; lazy-create window; choose main-window monitor | PERF-02, DESK-08 | M |
| Updater | Add signed auto-updater + “Check for updates” | DESK-05 | L |
| Shortcut UX | Release logger + visible registration failure; configurable shortcut; fix copy | DESK-07, UX-02 | S |
| Window toggle | Distinguish hidden/minimized/focused | DESK-09 | S |
| Block race | Queue apply/clear and reconcile after async | DESK-10 | S |
| SW repair | Always reload once after clearing, guarded | DESK-11 | S |
| Build script | Stop moving source; use a temp tree/worktree | DESK-06 | S |

**Release:** 0.2.0 (desktop reliability). Test on Windows 10/11, 100–150% DPI, single/dual monitor, sleep/wake, offline.

---

# Phase 5 — Performance & bundle (week 5, ~3 dev days)

| Item | Change | IDs | Effort |
|---|---|---|---|
| Icons | Subset/inline SVG; preload; <100 KB | PERF-03 | M |
| Assets | Remove 7.13 MB design assets from `public`; 64/128px avatar | PERF-04, PERF-05 | S |
| Clock | One shared clock; no tick when paused; stable listener deps | PERF-06 | M |
| Desktop IPC | Tick only while active; combine commands | PERF-07 | S |
| Service worker | Cache by pathname; precache shell/fonts; handle RSC | PERF-08 | M |
| Selectors | Field selectors; precompute session counts; memo stats | PERF-09, PERF-10 | S/M |
| Budgets | Add size-limit/asset/image checks to CI | TEST-03 | S |

**Acceptance:** home JS < 400 KB; font < 100 KB; export < 4 MB; idle IPC = 0/s; no paused-timer re-render.

---

# Phase 6 — UX, accessibility, testing (weeks 6–7)

### UX
- Fix guest identity (`UX-03`), dead settings (`UX-04`), day planner (`UX-05`), task menu clipping (`UX-07`), history navigation (`UX-08`), date/DST (`UX-12`), sync visibility (`UX-11`), sign-out safety (`UX-10`).
- Correct break/complete labels (`UX-13`) and login errors/claims (`UX-14`).
- Implement or remove advertised shortcuts (`UX-02`).

### Accessibility
- Focus trap/restore for modals; `aria-*`; label association; `focus-visible` rings; contrast tokens; `inert` background for overlays; avoid nested `<main>`; visible touch actions; `aria-live` timer/status/errors (`UX-09`).
- Add an axe Playwright scan and keyboard e2e for the new-task modal and overlay routes.

### Testing
- Add jsdom + Testing Library and Playwright.
- Priority tests: start→background→complete; StandbyCard while running; History with a break; quick-credit groups; NewTaskModal focus; offline PWA; two-device sync; PKCE exchange; 401 handling.
- Add coverage thresholds and CI (lint, typecheck, test, audit, asset budgets).

**Fixes:** `TEST-01`–`TEST-04`, `UX-*`.

---

# Dependency & sequencing graph

```
Phase 0 (quick wins) ──► Phase 1 (timer integrity) ──► Phase 2 (sync) ──► Phase 3 (security)
        │                         │                          │                  │
        └──────────► Phase 4 (desktop) ◄─────────────────────┘                  │
                                   │                                          │
                                   └──────────► Phase 5 (perf) ──► Phase 6 (UX/tests)
```

- Phase 1 must land before Phase 2 live-state work (archive semantics depend on atomic finalize).
- Phase 3 stale-token work is independent and can run in parallel from week 1.
- Phase 4 Rust completion should follow Phase 1's supervisor design so the JS and Rust paths share the same rules.
- Phase 5 asset removal is safe any time; do not combine with a major Next upgrade in the same release.

---

# Release & rollback plan

1. Ship 0.1.2 (Phase 0) to web + desktop, monitor for history totals complaints.
2. Ship 0.1.3 (Phase 1) with a one-time History correction note.
3. Ship 0.1.4 (Phase 2) after two-device integration tests pass.
4. Ship 0.1.5 (Phase 3) as a security release; force re-auth if tokens change.
5. Ship 0.2.0 (desktop) with the updater so subsequent fixes reach users automatically.

For each release:
- `npm test`, `npm run lint`, `npm run typecheck`, `npm audit --audit-level=high`.
- Desktop: cold start, tray hide/wake past expiry, sleep/wake, Focus Guard apply/clear/uninstall, multi-monitor.
- Web: offline reload `/` and `/tasks`, sign-in/out, sync two devices, delete/restore convergence.
- Keep the previous installer asset available; the download URL points to `latest`, so publish only after smoke tests.

---

# Effort summary (rough)

| Phase | Scope | Effort |
|---|---|---|
| 0 | Quick wins | ~1 day |
| 1 | Timer integrity + tests | ~3–4 days |
| 2 | Sync correctness + incremental | ~4–5 days |
| 3 | Security | ~4–6 days |
| 4 | Desktop reliability | ~4 days |
| 5 | Performance/bundle | ~3 days |
| 6 | UX/a11y/testing/CI | ~5–7 days |
| **Total** | | **~24–30 dev days** |

Security (Phase 3) can overlap Phase 1–2 with a second engineer or parallel runs.

---

# Definition of done (audit closure)

- [ ] `TIM-01`, `TIM-02`, `TIM-03`, `TIM-04`, `TIM-05`, `TIM-06` have regression tests.
- [ ] Any live session ending on any route produces exactly one correct History record and task credit.
- [ ] Sleep/quit gaps never inflate focus; `focusedMs ≤ plannedMs` for allocated sessions.
- [ ] Settings, tasks, sessions, deletions, and live state converge across two devices with clock skew.
- [ ] Desktop sign-out revokes the server credential; PKCE is mandatory; tokens are encrypted at rest.
- [ ] `npm audit --omit=dev` reports zero high/critical.
- [ ] Hidden-to-tray completion/notification works without reopening the window.
- [ ] Home JS < 400 KB, icon font < 100 KB, static export < 4 MB.
- [ ] CI runs lint, typecheck, tests, coverage thresholds, audit, and asset budgets.
- [ ] Axe/keyboard checks pass for core flows.
