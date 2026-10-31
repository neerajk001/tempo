# Tempo — Performance Audit

Companion to `AUDIT_SUMMARY.md`. Measurements were taken from the audited local build (`npm run desktop:build`, static export in `out/`, revision `333d531`). No performance fix was applied.

## Measurement summary

| Metric | Measured value | Source |
|---|---|---|
| Static export total | **14,245,713 B / 110 files** | `out/` recursive sum |
| Home HTML JS references | **650,685 B** across 15 chunks | `out/index.html` |
| Home CSS | **54,856 B** | `out/index.html` |
| Largest JS chunk | **172,834 B** (`fd9d1056-*.js`) | `out/_next/static/chunks` |
| Framework chunk | **139,978 B** | same |
| App chunk `117` | **124,635 B** | same |
| Main chunk | **117,072 B** | same |
| Polyfills | **112,594 B** | same |
| Icon font | **4,003,088 B** | `public/fonts/material-symbols-outlined.woff2` |
| Guest avatar PNG | **1,380,812 B** | `public/close_up_.../screen.png` |
| Unused design assets | **7,130,560 B / 28 files** | `public/tempo_*` |
| `.next` build cache | **127,553,984 B** | `.next/` (not shipped) |
| Source TS/TSX | **136 files / 804,005 B** | `src/` |
| Desktop installer | **14.07 MiB** | NSIS output |
| Tests | 19 files / 130 tests, ~12.2 s wall | `npm test` |

**Interpretation:** ~30% of the shipped desktop bundle is unused design assets (7.13 MB) and ~28% is a single icon font (4.0 MB). The actual app JS is ~650 KB uncompressed on first load. The 4 MB font uses `font-display: block`, so icons are invisible until it finishes.

---

## PERF-01 — Full-state sync on every mutation and auto-interval (High)

- **Status:** CONFIRMED
- **Files:** `src/lib/sync.ts:51-52,283-293,372-405`; `src/components/providers/SyncManager.tsx:30-32`; `src/app/api/sync/route.ts:227-250,287-338,375-441,497`
- **Problem:** Every local mutation triggers a 2.5 s debounced push of **all tasks and up to 1,000 sessions with events**. The server writes sessions **sequentially** (not batched; line 388 comment says so), and each update does `deleteMany(events)` + `updateMany` + event recreation. Every response returns the full server state again. Sync also runs every 90 s while visible, on focus, and on reconnect.
- **Impact:** A 500-session history means hundreds of sequential DB round-trips per push and multi-MB responses; on serverless this risks timeouts, and on mobile it burns data/battery. `getCurrentUser()` also performs a DB `upsert` on every authenticated request (`src/lib/current-user.ts:28-33`), turning reads into writes.
- **Evidence:** Sequential `for (const raw of sessions)` loop with `await` inside; no cursor/`updatedAt` incremental query; no ETag/`If-Modified-Since`; response includes all events.
- **Fix:** Incremental sync with a server cursor/sequence; send/receive only changed rows; batch writes in `$transaction`; skip unchanged sessions; add pagination to history; make `getCurrentUser` a read-only `findUnique` after first creation (cache the id).
- **Test:** Load test with 500 sessions: assert response bytes, query count, and zero writes for unchanged rows; add a body-size/perf budget.
- **Effort:** L

## PERF-02 — Mini window runs the full provider tree (Medium)

- **Status:** CONFIRMED
- **Files:** `src/app/layout.tsx:102-112`; `src/components/layout/AppChrome.tsx:16-27`; `SyncManager.tsx:16-42`; `AmbientMusic.tsx:130-168`
- **Problem:** The mini window loads `index.html` and the root layout mounts `AuthSessionProvider`, `ServiceWorkerRegister`, `GlobalShortcuts`, `SyncManager`, `DesktopBridge` (early-return), and `AmbientMusic`, even though `AppChrome` renders only `MiniTimer`.
- **Impact:** Two WebView2 app contexts, duplicate auth init/sync attempts, a second audio element (possible echo/overlap), extra startup work and memory on every launch (the mini is created eagerly, `src-tauri/src/lib.rs:403`).
- **Fix:** Give the mini a dedicated minimal entry/route (`/mini`) that mounts only the timer and event bridge; create the window lazily.
- **Test:** Compare WebView process count and memory with/without mini; assert one sync/migration per app; one audio stream.
- **Effort:** M

## PERF-03 — 4 MB icon font blocks icons on first load (Medium)

- **Status:** CONFIRMED
- **Files:** `src/app/globals.css:22-28`; `src/components/ui/Icon.tsx:1-7`; `public/fonts/material-symbols-outlined.woff2`
- **Problem:** The full variable Material Symbols font is 4,003,088 B, `font-display: block`, no preload/subset/unicode-range. Icons are ligature text.
- **Impact:** ~28% of the desktop export and a large first-load cost; icons invisible until download; offline failure renders raw words (`grid_view`).
- **Fix:** Subset to used glyphs, inline SVG for frequent icons, or split per set; preload the subset; add a font budget.
- **Test:** CI asserts font < 100 KB; Playwright offline icon render check.
- **Effort:** M

## PERF-04 — 7.13 MB of unused design assets ship (Medium)

- **Status:** CONFIRMED
- **Files:** `public/tempo_*` (15 directories/28 files), `src/app/robots.ts:12-20`
- **Problem:** Design reference screenshots/HTML/MD are copied into `out/`; not referenced by app code. `robots.ts` disallow does not remove them.
- **Impact:** Half the static export; slower deploy/install/CI; larger desktop installer.
- **Fix:** Move design references outside `public` or exclude at build; add an asset allowlist/reference check.
- **Test:** CI scans `public` for unreferenced assets and enforces a size budget.
- **Effort:** S

## PERF-05 — 1.38 MB portrait used as a 32 px avatar (Medium)

- **Status:** CONFIRMED
- **Files:** `src/lib/assets.ts:2-3`; `src/components/layout/Sidebar.tsx:115-116`; `TopBar.tsx:71-78`; `TaskDetails.tsx:737-738`
- **Problem:** Full-resolution personal PNG rendered at 32 px with a plain `<img>` (no `srcSet`/`next/image`), shown to guests too.
- **Impact:** ~1.4 MB download on every page for a 32 px image; privacy issue (`UX-03`).
- **Fix:** Ship 64/128 px WebP/AVIF derivatives; use a neutral guest avatar; `next/image` on web.
- **Test:** Image budget (<50 KB) and Lighthouse LCP.
- **Effort:** S

## PERF-06 — Multiple 1 s timers; paused still re-renders; unstable listener deps (Medium)

- **Status:** CONFIRMED
- **Files:** `src/hooks/useNow.ts:6-21`; `FocusSessionCard.tsx:68-69`; `RailCards.tsx:18-20`; `ScheduleList.tsx:33-48`; `InfiniteFocusCard.tsx:62`; `FocusView.tsx:116-118,280-314`; `QuickCreditPicker.tsx:21-27`
- **Problem:** The dashboard can mount four independent 1 s intervals. `useNow` ticks whenever `RUNNING || PAUSED`, so a paused timer still re-renders 600–800-line views every second. In `FocusView`, `useCreditChoice` returns a new object each render (default path) and it is in the keydown-effect deps, so the global listener is torn down/re-added every second.
- **Impact:** CPU wakeups, battery drain, low-end/mobile jank; unnecessary listener churn.
- **Fix:** One shared clock store/context; tick only while `RUNNING`; memoize the default credit or use a stable id; split the countdown into a small memoized component; use a minute cadence where seconds are not shown.
- **Test:** Fake-timer render-count tests: one shared interval while running, zero while paused, stable key listener identity.
- **Effort:** M

## PERF-07 — Desktop bridge performs three IPC calls every second while idle (Medium)

- **Status:** CONFIRMED
- **Files:** `src/components/providers/DesktopBridge.tsx:72-74,146-166`
- **Problem:** The ticker always emits a full state event and invokes `set_tray_tooltip` and `set_taskbar_progress` every second, even when no session runs. (The audit-time re-broadcast added for mini-timer freshness amplifies this.)
- **Impact:** Constant IPC/CPU wakeups and battery drain; redundant mini re-renders.
- **Fix:** Run the ticker only for `RUNNING`/`PAUSED`; update on store changes otherwise; combine tooltip/progress into one command; consider pausing when hidden (with a Rust-side completion path).
- **Test:** Mock IPC; assert zero calls when `IDLE` and at most one combined call per second while running.
- **Effort:** S

## PERF-08 — Service worker caches every navigation under `/` (Medium)

- **Status:** CONFIRMED
- **Files:** `public/sw.js:52-61`
- **Problem:** `caches.open(PAGE_CACHE).then(c => c.put("/", copy))` stores whichever route was last visited as `/`. Offline `caches.match("/")` can serve `/tasks` HTML at `/`. The precache contains only icons/manifest, not the app shell/CSS/fonts; RSC `.txt` and `/fonts/` are not handled.
- **Impact:** Wrong page offline, missing fonts, broken client transitions; contradicts offline/PWA claims.
- **Fix:** Cache by `url.pathname`, precache shell/CSS/fonts, handle RSC `.txt`, cache only 200s, version caches.
- **Test:** Playwright offline reload of `/` and `/tasks` returns the correct content/fonts.
- **Effort:** M

## PERF-09 — Whole-store subscriptions and per-row scans (Medium)

- **Status:** CONFIRMED
- **Files:** `src/app/settings/page.tsx:78-79`; `src/components/tasks/TaskTable.tsx:188`; `DashboardHome.tsx:31-53`; `GuestLifecycle.tsx:28-42`
- **Problem:** Settings subscribes to entire pomodoro/prefs stores (re-renders the 642-line page on any change); each TaskRow filters the whole session list on every update (O(rows×sessions)); Dashboard stats recompute on every render; the guest marker writes localStorage every minute even when hidden.
- **Impact:** Avoidable re-renders and storage writes, especially with hundreds of sessions.
- **Fix:** Selectors per field; precompute `sessionCountsByTask` once per pass; `useMemo` stats; throttle/stop the guest interval when hidden.
- **Test:** Render-count assertions and an extracted pure helper unit test.
- **Effort:** S/M

## PERF-10 — Large, unbounded persisted history and per-keystroke writes (Low/Medium)

- **Status:** CONFIRMED
- **Files:** `src/stores/session-history-store.ts:82-92`; `src/lib/sync.ts:320-326`; `TaskDetails.tsx:87-94`; `FocusSessionCard.tsx:134-141`
- **Problem:** Up to 500 sessions with full event arrays are serialized to localStorage; scratchpad keystrokes write localStorage immediately; sync reconcile calls `setState` even when merged data is unchanged.
- **Impact:** Main-thread JSON work, quota risk, full subscribed re-renders on every sync.
- **Fix:** Debounce writes; skip `setState` when deep-equal; consider IndexedDB for history; trim event arrays.
- **Test:** Quota-full simulation and a no-op reconcile assertion.
- **Effort:** M

---

## Bundle and asset budgets (recommended)

| Budget | Current | Target | Enforcement |
|---|---|---|---|
| Home JS (uncompressed) | 650,685 B | < 400 KB | CI size-limit |
| Icon font | 4,003,088 B | < 100 KB subset | CI byte check |
| Unused public assets | 7,130,560 B | 0 | CI reference scan |
| Guest avatar | 1,380,812 B | < 50 KB | CI image check |
| Static export | 14.2 MB | < 4 MB | CI artifact size |
| Largest JS chunk | 172,834 B | < 150 KB | size-limit |
| `/api/sync` response (500 sessions) | unmeasured | < 500 KB with cursor | load test |
| Desktop idle IPC | 3/s | 0/s | unit test |

## How to measure after fixes (no guessing)

1. `npx size-limit` or a custom script over `out/_next/static/chunks`.
2. `Get-ChildItem out -Recurse | Measure-Object Length -Sum` for export size.
3. Chrome/Edge Performance panel: record 60 s idle dashboard → count long tasks and layout shifts.
4. React Profiler: render counts for `FocusSessionView` while paused vs running.
5. Playwright + `PerformanceObserver` for LCP/CLS on desktop cold start and offline reload.
6. Load test `/api/sync` with 500 sessions and an unchanged second push; assert zero writes via Prisma query logging.
7. Windows Task Manager / `Get-Process` for WebView2 process count and working set with/without the mini window.

## Positive performance notes

- Timer math is timestamp-derived; the seconds tick does **not** write localStorage.
- Most effect listeners have cleanup; the problem is frequency, not obvious leaks.
- Immutable Zustand updates are used; selectors are present in many components.
- The desktop static export avoids server round-trips for UI routes.
