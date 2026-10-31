# Tempo — Full Project Audit Summary

**Audit date:** 2026-10-31
**Audited revision:** `333d531` (`main`, desktop 0.1.1)
**Scope:** Next.js 14 web app + Tauri 2 Windows desktop app + Rust helpers + Prisma/sync layer.
**Method:** full static read of the listed modules, cross-checked traces, git history scan for secrets, `npm audit`, dependency/config inspection, and measured build artifacts. No application code was changed. Only these audit documents were added.

## Baseline results (actually run)

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` | **19 files / 130 tests pass** |
| Lint | `npm run lint` | **clean** |
| Typecheck | `npm run typecheck` | **clean** |
| Production audit (runtime deps) | `npm audit --omit=dev` | **3 advisories: 1 critical, 2 high** |
| Full audit (incl. dev) | `npm audit` | **27 advisories: 3 critical, 10 high, 14 moderate** |
| Desktop build | `npm run desktop:build` | **succeeded**, installer 14.07 MiB |
| Static export | `out/` | **14.2 MB / 110 files** |
| Home JS payload | `out/index.html` references | **650,685 B JS** + 54,856 B CSS |

> Passing tests does **not** cover the failure modes below: the suite is pure-logic only (`environment: "node"`), with no React component, API route, sync integration, desktop-bridge, or browser tests.

## Test status vs. risk

- 130 passing tests cover timer math, dashboard stats, sync merge helpers, settings-sync helpers, auth token primitives, and planning.
- **Zero** tests exercise `/api/sync`, the desktop bridge, PKCE exchange, history rendering, or any React component.
- The most severe issues found (timer over-credit, StandbyCard data loss, settings sync mismatch, tombstone resurrection, break accounting) are all in untested paths.

## Severity counts (confirmed + hypothesis)

| Severity | Count | Notes |
|---|---|---|
| Critical | 5 | 2 timer/data, 1 sync data loss, 1 desktop security lifecycle, 1 dependency |
| High | 14 | timer lifecycle, sync conflicts, account switching, PKCE, revocable sessions |
| Medium | 24 | desktop reliability, UX/a11y, performance, sync caps |
| Low | 13 | polish, copy, diagnostics, dead controls |

Counts include both confirmed defects and explicitly labeled hypotheses (platform/runtime dependent).

## Top 5 issues (highest impact)

1. **Timer over-credit and missing global completion supervisor** — `getElapsedFocusMs` is unbounded, and completion only runs on 3 of 11 routes. A block that ends while the user is elsewhere (or during sleep / hidden-to-tray) is completed much later and credits the entire gap as focus. See `TIM-01`, `TIM-02`, `DESK-02`.
2. **“Start New Session” silently destroys a live session** — `StandbyCard` calls `reset()` before `start()`, so elapsed work is discarded with no confirmation, no History row, and no task credit. See `TIM-03`.
3. **Cross-device sync is lossy/partly broken** — settings never sync (field-name mismatch), deletions resurrect (no server tombstones), server/client LWW compares different clocks, and a remote live state can erase a running session without logging it. See `SYNC-01`–`SYNC-04`.
4. **Desktop credential lifecycle is not production-grade** — 30-day bearer tokens cannot be revoked, sign-out only deletes the local file, tokens are stored in plaintext and exposed to the webview, PKCE is optional server-side, and `csp: null`. Compounded by **critical Next.js advisories**. See `SEC-01`–`SEC-05`.
5. **Break time is counted as focus** — Break records are logged with `focusedMs`, History totals all phases, `preserveActiveProgress` credits break elapsed as task focus, and `breakMs` is hard-coded to 0 everywhere. See `TIM-04`, `TIM-05`, `TIM-06`.

## First 3 fixes I recommend

1. **Make completion atomic and clamped, then move it to one global supervisor.** Clamp `focusedMs ≤ plannedMs` for allocated sessions and run expiry once per app (not per page). Fixes `TIM-01`, `TIM-02`, and the worst desktop reliability symptom. Effort: M.
2. **Stop silent data loss in `StandbyCard`.** Remove `reset()` before `start()`; make `reset()` refuse while `RUNNING`/`PAUSED`. Effort: S.
3. **Fix the sync contract and make break accounting truthful.** Send/read the same `clientUpdatedAt` field, filter History to `phase === "FOCUS"`, and populate `breakMs`. Effort: S–M.

Security remediation (Next upgrade, mandatory PKCE, revocable tokens) should start in parallel because it is independent and has a large blast radius.

## Master findings index

Severity key: **C**ritical / **H**igh / **M**edium / **L**ow. Status: **C**onfirmed by code trace / **H**ypothesis (runtime or exploit dependent).

| ID | Sev | Status | Finding | Primary location | Effort |
|---|---|---|---|---|---|
| TIM-01 | C | C | Sleep/offline gap credited as focus; completion not clamped | `src/lib/pomodoro-machine.ts:201-218`, `src/hooks/useFinishSession.ts:37-98` | M |
| TIM-02 | C | C | Completion/notification only on `/`, `/focus`, `/break` | `FocusSessionCard.tsx:71-74`, `FocusView.tsx:150-153`, `BreakView.tsx:60-63` | M |
| TIM-03 | C | C | StandbyCard `reset()+start()` discards live session | `src/components/dashboard/RailCards.tsx:273-276` | S |
| SYNC-01 | C | C | Deletions resurrect; no durable server tombstones | `src/lib/sync.ts:182-269`, `src/app/api/sync/route.ts:296-303` | L |
| SEC-01 | C | C (version) / H (exploit) | Next.js 14.2.35 critical advisories; web image optimizer enabled | `package.json:28`, `next.config.mjs:11-16` | L (S interim) |
| TIM-04 | H | C | Break time counted as focused in History and task progress | `HistoryClient.tsx:154-162`, `task-store.ts:502-553` | S |
| TIM-05 | H | C | `breakMs` always 0; break UI permanently zero | `useFinishSession.ts:45-46,129`, `task-store.ts:515` | M |
| TIM-06 | H | C | Preemption cancels/logs focus without crediting task | `pomodoro-store.ts:186-214` | S |
| TIM-07 | H | C | Finish actions non-atomic; double invocation duplicates history/credit | `useFinishSession.ts:37-161` | M |
| TIM-08 | H | C | `autoStartFocus` starts workspace default, not task slice | `useFinishSession.ts:110-115` | S |
| TIM-09 | H | C | No cross-tab coordination; parallel timers / lost writes | `pomodoro-store.ts:176-486`, `task-store.ts`, `session-history-store.ts` | L |
| SYNC-02 | H | C | Task LWW compares client `updatedAt` to server `@updatedAt`; skew loses edits | `prisma/schema.prisma:111`, `api/sync/route.ts:309-332` | M |
| SYNC-03 | H | C | Remote live state overwrites a running session without logging | `src/lib/live-sync.ts:112-115,199-216` | M |
| SYNC-04 | H | C | Settings sync field mismatch → settings never update after first row | `src/lib/settings-sync.ts:125`, `api/sync/route.ts:444-469` | S |
| SEC-02 | H | C | PKCE optional server-side | `api/desktop/auth/start/route.ts:44-49,61-69`, `exchange/route.ts:45-53` | S |
| SEC-03 | H | C | 30-day desktop tokens not revocable; sign-out is local-only | `src/lib/desktop-auth.ts:24-25`, `auth-actions.ts:33-39` | M/L |
| SEC-04 | H | C | Desktop account switch uploads previous user's local data into new account | `SyncManager.tsx:20-24`, `sync.ts:451-456` | M |
| SEC-05 | H | C (exposure) / H (XSS) | Sync token plaintext + returned to JS; `csp: null` | `src-tauri/src/lib.rs:134-164`, `tauri.conf.json:30` | L |
| DESK-01 | H | C | Desktop auth event can fire before JS listener registers | `desktop-auth-store.ts:110-117`, `src-tauri/src/lib.rs:201-269` | S |
| DESK-02 | H | C (config) / H (suspend) | `backgroundThrottling` unsupported on Windows; hidden webview may suspend timers | `tauri.conf.json:26`, `DesktopBridge.tsx:72-166` | M/L |
| DESK-03 | M/H | C | Focus Guard cleanup incomplete on helper removal/uninstall | `src-tauri/src/blocking.rs:236-257`, `tauri.conf.json:47-52` | M |
| DESK-04 | H/M | C pattern / H exploit | Elevated helper uses predictable `%TEMP%` script and unquoted paths | `src-tauri/src/blocking.rs:147-168` | M |
| DESK-05 | M | C | No auto-updater; manual unsigned reinstall only | `Cargo.toml:20-32`, `tauri.conf.json:33-53` | L |
| DESK-06 | H | C | Desktop build script can delete source if interrupted | `scripts/build-desktop.mjs:40,56-65` | S |
| DESK-07 | M | C | Global shortcut failure silent in release | `src-tauri/src/lib.rs:507-513,394-401` | S |
| DESK-08 | L/M | C | Mini window always on primary monitor; position not restored | `src-tauri/src/lib.rs:49-58` | S |
| DESK-09 | L | C | Tray/hotkey hides visible-but-unfocused or minimized window | `src-tauri/src/lib.rs:34-42` | S |
| DESK-10 | M | C | Focus Guard apply/clear race leaves sites blocked | `DesktopBridge.tsx:108-144` | S |
| DESK-11 | M | C | Stale service-worker repair can fail to reload | `ServiceWorkerRegister.tsx:13-22`, `src-tauri/src/lib.rs:323-343` | S |
| PERF-01 | H | C | Full-state sync every 2.5s/90s; sessions sequential; all events returned | `src/lib/sync.ts:283-405`, `api/sync/route.ts:375-441` | L |
| PERF-02 | M | C | Mini window mounts full provider tree (sync/auth/audio) | `src/app/layout.tsx:102-112`, `AppChrome.tsx:16-27` | M |
| PERF-03 | M | C | 4.0 MB icon font blocks icons on first load | `globals.css:22-28`, `public/fonts/material-symbols-outlined.woff2` | M |
| PERF-04 | M | C | 7.13 MB unused design assets shipped in `public`/`out` | `public/tempo_*` | S |
| PERF-05 | M | C | 1.38 MB portrait used as 32px avatar | `src/lib/assets.ts:2-3`, `Sidebar.tsx:115` | S |
| PERF-06 | H | C | Multiple 1s timers; paused still ticks; unstable keydown deps | `useNow.ts:6-21`, `FocusSessionCard.tsx`, `FocusView.tsx` | M |
| PERF-07 | M | C | Desktop bridge does 3 IPC calls every second even when idle | `DesktopBridge.tsx:146-166` | S |
| PERF-08 | M | C | Service worker stores every navigation under `/` | `public/sw.js:52-61` | M |
| PERF-09 | M | C | Settings subscribes to whole stores; TaskTable O(rows×sessions) per update | `settings/page.tsx:78-79`, `TaskTable.tsx:188` | S |
| UX-01 | H | C | History counts break time; disagrees with Dashboard | `HistoryClient.tsx:154-162` | S |
| UX-02 | M | C | Advertised shortcuts dead/misleading (`⌘E`, `⌘K`) | `FocusView.tsx:280-314`, `TopBar.tsx:27-35` | S |
| UX-03 | M | C | Guest sees owner name “Neeraj” + personal portrait | `DashboardHeader.tsx:24-28`, `assets.ts:2-3` | S |
| UX-04 | M | C | Settings dead controls (Light Mode, Custom duration), copy mismatch | `settings/page.tsx:255,402,458-471` | S/M |
| UX-05 | M | C | Day planner never accounts for busy events, doesn't persist, wrong route | `DayPlanner.tsx:68-110` | M/L |
| UX-06 | M | C | TaskDetails delete has no confirm; paused Play calls pause again | `TaskDetails.tsx:356-367,536-538` | S |
| UX-07 | M | C | Task row menu clipped by `overflow-hidden` | `TasksPage.tsx:254-322`, `TaskTable.tsx:286-320` | S |
| UX-08 | M | C | History capped at 500; session details unreachable | `session-history-store.ts:90`, `sync.ts:53`, `HistoryClient.tsx` | M |
| UX-09 | M | C | Accessibility cluster: modal focus, nested mains, labels, contrast | see `EDGE_CASES.md` | M |
| UX-10 | M | C | Sign-out clears local data before confirming; unsynced work lost | `auth-actions.ts:28-39` | S/M |
| UX-11 | M | C | Sync failures only visible in Settings | `sync-store.ts`, `settings/page.tsx` | S |
| UX-12 | M | C | Date rollover/DST/stale “starts in” labels | `DashboardHome.tsx:30-53`, `TasksPage.tsx:65-110` | S |
| SEC-06 | M | C | No body-size limits, field caps, rate limits, or quotas | `api/sync/route.ts:98-134,283-294,444-495` | M |
| SEC-07 | M | C | Guest/local data auto-migrates into next account | `SyncManager.tsx:20-24`, `sync.ts:451-456`, `guest.ts:19` | M |
| SEC-08 | L | C | No web CSP; JSON-LD via `dangerouslySetInnerHTML` | `next.config.mjs:18-33`, `layout.tsx:96-99` | S/M |
| SEC-09 | M | H | Identity keyed only by mutable email | `current-user.ts:19-36`, `schema.prisma:39-50` | M |
| SEC-10 | L | C | Client-chosen IDs unvalidated; web hrefs not encoded | `api/sync/route.ts:95,131`, `hrefs.ts:9-14` | S |
| SEC-11 | L | C | Infra hints in errors; unauthenticated health metadata | `api/tasks/route.ts:58-64`, `api/sessions/route.ts:65-71`, `api/health/route.ts` | S |
| TEST-01 | H | C | No sync/API contract or integration tests | `vitest.config.ts:4-8` | M/L |
| TEST-02 | H | C | No component/e2e tests; node env only | `vitest.config.ts`, `package.json` | L |
| TEST-03 | M | C | No coverage thresholds, CI, bundle/image budgets | `vitest.config.ts`, repo root | M |
| TEST-04 | L | C | Test hygiene: no fake timers; globals mutated | `guest.test.ts:34-70`, `infinite-focus.test.ts` | S |

Detail, reproduction steps, fixes, and regression tests are in:
- `EDGE_CASES.md` — timer, state, sync, desktop edge cases, UX/a11y, testing gaps
- `PERFORMANCE_AUDIT.md` — measurements, hot paths, budgets
- `SECURITY_AUDIT.md` — dependency, auth, token, CSP, CORS, secrets
- `IMPROVEMENT_ROADMAP.md` — sequenced plan and acceptance criteria

## Verified controls (do not regress)

- No real secrets in tracked files or git history; only the `.env.example` placeholder was found.
- Tenant scoping is enforced on tasks/sessions/sync; no cross-user IDOR found.
- No raw SQL, `eval`, or `new Function`; Prisma is parameterized.
- Mass assignment is blocked by explicit field whitelists.
- Desktop JWT verification is pinned to HS256 with issuer/audience/expiry.
- CORS uses an exact allowlist, not `*`.
- API/guest data is never cached by the service worker.
- Existing single-active-session behavior works within one store instance.

## Explicit limitations

- No live multi-device, sleep/wake, or Windows installer test was executed. Runtime-dependent items are marked **H**.
- No database or production deployment was queried; DB behavior is inferred from code and the installed Prisma schema.
- Exploit scenarios for local processes/Windows elevation are hypotheses without an isolated VM test.
- Line numbers reflect the audited revision; they may drift after fixes.

---

# Post-audit implementation status (applied after approval)

This section records what changed after the audit. The original findings above remain the historical audit record.

## Implemented / partially implemented

| Area | Status | Notes |
|---|---|---|
| `TIM-01` | Done | Allocation clamp + scheduled `endedAt` (`pomodoro-machine.ts`), applied in store and finish hook. |
| `TIM-02` | Done | Single `TimerSupervisor` mounted in the main shell; page-local expiry effects removed. |
| `TIM-03` | Done | `StandbyCard` no longer resets first; `reset()` refuses while live. |
| `TIM-04`, `TIM-05` | Done | Break phases log `focusedMs: 0` with real `breakMs`; task progress + History are FOCUS-only. |
| `TIM-07` | Partial | `complete()`/`cancel()` are idempotent booleans; finish hook reads live state. Full atomic finalize service still pending. |
| `TIM-09` | Partial | Cross-tab `storage` rehydration added; no leader lock yet. |
| `TIM-11` | Done | Task Details pause/resume toggle fixed. |
| `TIM-18` | Done | Event cap retains START + terminal event (client/server). |
| `SYNC-04` | Done | `toRemoteSettings()` maps `updatedAt ? clientUpdatedAt`. |
| `SYNC-05` | Done | Server `clearHistory` flag + client request marker. |
| `SYNC-06`, `SYNC-07` | Done | Server tie-break + atomic nested event replacement; pending push flush. |
| `SEC-02` | Done | PKCE + state mandatory on start/exchange. |
| `SEC-05`, `SEC-08` | Partial | Web/Tauri CSP added; token still plaintext and exposed to JS. |
| `SEC-12`, `SEC-19` | Partial | Placeholder secret rejected; local `.env` rotated; `.gitignore`/example fixed. Short secrets only warn. |
| `SEC-13`, `SEC-14` | Partial | Loopback no-store/no-referrer/token-strip + state validation; one-time `jti` redemption and client registration still pending. |
| `DESK-01` | Done | Listener registration completes before the browser opens; cancellable wait. |
| `DESK-03`, `DESK-04` | Partial | Helper removal clears hosts; random temp script, quoting, cleanup. NSIS uninstall hooks + signed helper still pending. |
| `DESK-06` | Done | Build script restores instead of deleting staging; safe re-run. |
| `DESK-07` | Partial | Release warning logger enabled; no visible UI yet. |
| `DESK-08`, `DESK-09`, `DESK-10`, `DESK-11` | Done | Lazy mini window + main-monitor placement; state-aware toggle; serialized block reconcile; versioned SW repair. |
| `DESK-12` | Partial | Tray skip no longer cancels a live focus; full phase-aware semantics pending. |
| `PERF-04` | Done | 8.5 MB of design assets moved out of `public`; desktop export 14.2 MB ? 5.75 MB, installer 14.07 ? 6.50 MiB. |
| `PERF-05` | Done | 1.38 MB personal portrait replaced by a small neutral guest SVG. |
| `PERF-06` | Partial | Ticks stop while paused; schedule tick reduced to 30 s. |
| `PERF-07` | Done | Desktop IPC stops when idle. |
| `PERF-08` | Done | SW caches navigations by pathname; fonts handled. |
| `UX-03` | Done | Guest name/avatar no longer the owner's identity. |
| `UX-12`, `UX-13` | Partial | History DST-safe yesterday; �Resume Break� label. |

## Deferred (need a decision or a dedicated change)

- **`SEC-01`** Next.js major upgrade (14.2.35 ? patched line). Requires a dedicated upgrade PR and full regression pass.
- **`SYNC-01`, `SYNC-02`, `SEC-03`, `SEC-15`** require Prisma schema changes/migrations. The configured database is remote Neon and the repo has no migrations directory, so no schema change was applied.
- **`SEC-04`, `SEC-07`** owner-scoped local data across accounts requires a UX policy decision (import/keep/discard).
- **`DESK-02`** Rust-side timer/completion and **`DESK-05`** signed auto-updater require larger work/signing keys.
- **`PERF-01`** incremental sync, **`PERF-02`** minimal mini entry, **`PERF-03`** icon subset.
- **`UX-09`** full accessibility pass, **`UX-05`** day planner, **`UX-07`** task menu portal, **`UX-08`** history pagination, **`UX-10`** safe sign-out, **`UX-11`** global sync banner, **`UX-14`** login errors.

## Verification after the implementation batch

- `npm run typecheck` � clean
- `npm run lint` � clean
- `npm test` � **139/139 passing**
- `npm run build` � succeeds
- `npm run desktop:build` � succeeds; NSIS installer **6.50 MiB**
- `cargo check --release` � clean after desktop changes

## Operational notes

- The local `.env` `NEXTAUTH_SECRET` was the shipped placeholder and was rotated to a random 48-byte value (value not recorded in the repo). Set a strong `NEXTAUTH_SECRET` and a separate `DESKTOP_AUTH_SECRET` in production before deploying; existing web sessions/desktop tokens signed with the old secret will be invalidated.
- The web CSP allows inline styles/scripts because Next injects them; it restricts external script/connect origins. Re-test media, avatars, and the desktop build after any host/API change.
- No commit or release was made after this implementation batch.
