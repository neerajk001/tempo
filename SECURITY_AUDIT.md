# Tempo — Security Audit

Companion to `AUDIT_SUMMARY.md`. Read-only audit; no application code was changed.

## Audit inputs

- Full read of auth, sync, API routes, Prisma schema, desktop bridge/token storage, Tauri config/capabilities, CORS, and env examples.
- `npm audit --omit=dev --json` and `npm audit --json`.
- `git ls-files` + `git grep` secret scan; `git log -p --all` scan reported by the static review.
- Local config inspection (values never printed): `.env` is untracked; `NEXTAUTH_SECRET` is 23 characters; `DESKTOP_AUTH_SECRET` is not set; `.env.production` is **not** ignored.

## Bottom line

- **No committed real secrets** were found (only `.env.example` placeholders).
- Tenant isolation, mass-assignment whitelists, SQL safety, JWT algorithm pinning, and CORS allowlisting are **good**.
- The weak points are **credential lifecycle** (30-day non-revocable desktop tokens, optional PKCE), **secret/config validation**, **account-switch data isolation**, and **dependency currency**.
- 130 passing tests do not cover any of these paths.

---

## SEC-01 — Critical Next.js advisories in a production dependency

- **Severity:** Critical (version) / High (contextual exploitability)
- **Status:** CONFIRMED version; exploitability HYPOTHESIS
- **Files:** `package.json:28` (`next: 14.2.35`); `next.config.mjs:11-16` (image optimization disabled only for desktop)
- **Evidence:** `npm audit --omit=dev` reports **1 critical + 2 high** runtime advisories. `next` is flagged across 24 advisories, including:
  - unauthenticated RCE on Windows-hosted servers (`GHSA-p293-qw3h-jr36`)
  - unauthenticated RCE in the Image Optimization API with SVG/AVIF (`GHSA-2xp9-vwfh-vxw4`, `GHSA-2464-fhr4-w9xw`)
  - image-optimizer DoS/disk exhaustion; RSC deserialization DoS; cache poisoning; SSRF in rewrites/WebSocket upgrades; middleware/proxy cache poisoning
- **Context:** The app uses App Router (RSC) and the web build leaves `/_next/image` enabled. It does not appear to use `next/image`, Server Actions, custom rewrites, or a self-hosted Windows server, which reduces some exploit paths; the DoS/cache advisories still matter for any internet-facing deployment.
- **Impact:** denial of service, cache poisoning, and (on vulnerable hosting) RCE; supply-chain exposure.
- **Repro:** `npm audit --omit=dev`; `curl -I https://<host>/_next/image?url=%2Ficons%2Ficon-512.png&w=1&q=1` (do not send exploit payloads).
- **Fix:** Upgrade to a patched Next line (audit suggests 16.4.3; or the latest patched 14.2.x/15.x), align `eslint-config-next`. Interim: `images: { unoptimized: true }` on web too, or block `/_next/image` at the edge. Add CI `npm audit --audit-level=high`.
- **Test:** CI dependency gate; HTTP test that `/_next/image` is disabled/rate-limited; post-upgrade route smoke tests.
- **Effort:** L (major upgrade) / S (interim)

## SEC-02 — PKCE is optional server-side

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/app/api/desktop/auth/start/route.ts:44-49,61-69`; `src/app/api/desktop/auth/exchange/route.ts:45-53`
- **Root cause:** `/start` validates `code_challenge` only when present and mints a login token without a challenge otherwise. `/exchange` only checks the verifier when `claims.challenge` exists.
- **Impact:** A login token minted without a challenge is a pure bearer credential. Combined with the any-port loopback (SEC-14), a local attacker can obtain and redeem it without proving possession of a verifier. The official desktop client always sends PKCE, so this weakens the server, not the client.
- **Repro (test account):** Request `/start` without `code_challenge`, capture the redirect `token`, POST `/exchange` with an empty verifier → 200 + 30-day sync token.
- **Fix:** Require a non-empty valid S256 challenge on `/start`; require a well-formed verifier on `/exchange`; reject tokens without a challenge; consider requiring `code_challenge_method=S256`.
- **Test:** Missing challenge → 400; challenge-less token exchange → 401; wrong verifier → 401; correct → 200.
- **Effort:** S

## SEC-03 — 30-day desktop sync tokens cannot be revoked

- **Severity:** High
- **Status:** CONFIRMED
- **Files:** `src/lib/desktop-auth.ts:24-25,36-54`; `src/lib/auth-actions.ts:33-39`; `src/stores/desktop-auth-store.ts:144-147`; `src-tauri/src/lib.rs:158-164`
- **Root cause:** Tokens are stateless HS256 JWTs with no `jti`, device record, or token version. There is no revocation endpoint or token table. Desktop “Sign out” only deletes the local file.
- **Impact:** A token copied from `desktop-auth.json`, captured by malware, or included in a roaming-profile backup stays valid for up to 30 days after sign-out. Lost devices cannot be deauthorized selectively.
- **Repro:** Copy the token, click Sign out, then `curl -H "Authorization: Bearer <token>" https://<host>/api/sync` → still 200.
- **Fix:** Server-side session/refresh-token records (`jti`, device id, revoked), short-lived access tokens + rotating refresh, “sign out all devices,” and call server revocation on desktop sign-out. At minimum reduce the TTL.
- **Test:** Mint → call `/api/sync` (200) → revoke → call again (401); sign-out revokes.
- **Effort:** M/L

## SEC-04 — Desktop account switch pushes previous user's data into the next account

- **Severity:** High
- **Status:** CONFIRMED (shared-device scenario)
- **Files:** `src/components/providers/SyncManager.tsx:20-24`; `src/lib/sync.ts:451-456`; `src/lib/auth-actions.ts:33-39`; `src-tauri/src/lib.rs:158-164`
- **Root cause:** Local data is not owner-scoped. Desktop sign-out preserves local stores. On **every** transition to `authenticated`, the client calls `migrateGuestToAccount()` → `syncNow(true)`, uploading all local tasks/sessions/settings/live state with the current token and merging the account's cloud state back.
- **Impact:** User A signs out; User B signs in on the same OS account; A's local data is uploaded to B's cloud account and B's data is merged into local stores. Cross-user confidentiality breach and data corruption.
- **Repro:** Sign in as A, create a marked task, sync, sign out, sign in as B → B's `/api/sync` contains A's marker.
- **Fix:** Tag local data with an owner id; never auto-import across accounts; prompt “Import / Keep local / Discard”; default “sign out and clear local data” on shared devices; only migrate on explicit first-time import.
- **Test:** Sign in as a different account does not POST prior data; explicit import works; local data remains namespaced.
- **Effort:** M

## SEC-05 — Sync token is plaintext and returned to the webview; Tauri CSP disabled

- **Severity:** High (exposure) / Medium (XSS exploit hypothesis)
- **Status:** CONFIRMED storage/exposure; no direct XSS found
- **Files:** `src-tauri/src/lib.rs:134-164` (plaintext `desktop-auth.json`); `src/stores/desktop-auth-store.ts:90-93,132`; `src-tauri/tauri.conf.json:30` (`"csp": null`); `src-tauri/capabilities/default.json:5-20` (both windows)
- **Root cause:** Token persisted as plaintext JSON under Tauri app-data; `desktop_auth_load` returns the raw token to JS; CSP is explicitly disabled; custom commands are not scoped to the main window.
- **Impact:** Any process running as the same Windows user, roaming-profile sync, or any future XSS in either webview can read a 30-day full-sync bearer token. XSS could also call `desktop_auth_save` to redirect sync into an attacker account, or invoke privileged blocking commands.
- **Repro:** `type %APPDATA%\site.neerajx.tempo\desktop-auth.json`; in devtools `await window.__TAURI_INTERNALS__.invoke("desktop_auth_load")`.
- **Fix:** DPAPI/Credential Manager or Stronghold; keep the token in Rust and proxy requests; strict CSP; restrict auth/blocking commands to `main`; restrictive file ACL; `Cache-Control: no-store`.
- **Test:** No token returned to JS; DPAPI round-trip; ACL/mode test; CSP assertion; capability test that mini cannot invoke auth/blocking.
- **Effort:** L

## SEC-06 — No rate limits, body caps, or quotas; DB write on every authenticated request

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/app/api/sync/route.ts:98,114-115,134,283-294,444-495`; `src/app/api/desktop/auth/exchange/route.ts:24-35`; `src/lib/current-user.ts:28-33`; no rate-limit code/dependency
- **Root cause:** `req.json()` parses the full body before slicing arrays; `description`, `subtasks`, `calendarEventId`, `taskTitle`, and arbitrary settings/live JSON are unbounded; no per-user storage quota; no rate limiting. `getCurrentUser()` performs a DB `upsert` on every authenticated call.
- **Impact:** Any free Google account can store huge JSON blobs and force expensive reads/writes; unauthenticated attackers can flood `/api/desktop/auth/exchange`; every read becomes a DB write.
- **Repro:** Authenticated POST `/api/sync` with multi-MB descriptions/subtasks/settings; loop `GET /api/tasks` and observe `User.updatedAt` writes.
- **Fix:** Edge body limit (~256 KB), per-field/array/JSON-depth validation, quotas, per-IP/user rate limits, and change `getCurrentUser` to `findUnique` after first creation.
- **Test:** Oversized body → 413/400; quota → 429/403; normal GET performs no update.
- **Effort:** M

## SEC-07 — Guest/local data auto-migrates into whichever account signs in next

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/components/providers/SyncManager.tsx:20-24`; `src/lib/sync.ts:451-456`; `src/lib/guest.ts:19,60-67`
- **Root cause:** Guest data is identified only by a 7-day timestamp, not an owner. Sign-in always imports it with no consent.
- **Impact:** On a shared browser, user A's guest tasks/notes/history are uploaded to user B's account (and B's cloud data appears locally).
- **Fix:** Explicit import consent; owner tagging; namespace storage per account; clear guest data when a different account signs in.
- **Test:** Different account sign-in does not auto-import; explicit import works.
- **Effort:** M

## SEC-08 — No web CSP; inline JSON-LD via `dangerouslySetInnerHTML`

- **Severity:** Medium (defense-in-depth)
- **Status:** CONFIRMED
- **Files:** `next.config.mjs:18-33` (HSTS/nosniff/XFO/Referrer-Policy, **no CSP**); `src/app/layout.tsx:96-99` (JSON-LD inline)
- **Root cause:** CSP is absent on web and null on desktop. The JSON-LD script serializes a build-time object without `<` escaping.
- **Impact:** Any future XSS has no containment layer; on desktop it can reach the token (SEC-05).
- **Fix:** Strict CSP with nonces/hashes; `JSON.stringify(...).replace(/</g, "\\u003c")`; Tauri CSP limited to local assets + API.
- **Test:** Header assertions; `</script>` payload in `NEXT_PUBLIC_SITE_URL` does not break out; HTML in task titles renders as text.
- **Effort:** S/M

## SEC-09 — Identity keyed only by mutable email

- **Severity:** Medium (hypothesis-dependent)
- **Status:** HYPOTHESIS for exploit; pattern CONFIRMED
- **Files:** `src/lib/current-user.ts:19-36`; `prisma/schema.prisma:39-50`
- **Root cause:** `db.user.upsert({ where: { email } })`; no `providerAccountId`, no `email_verified` check, no explicit linking.
- **Impact:** A recycled/reassigned Google Workspace email (or a future second provider with a colliding email) inherits the previous user's data.
- **Fix:** Unique `(provider, providerAccountId)`; verify `email_verified`; explicit account linking; audited email changes.
- **Test:** Same email/different provider account ids do not share data unless linked; unverified email rejected.
- **Effort:** M

## SEC-10 — Client-chosen IDs unvalidated; web hrefs not encoded

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `src/app/api/sync/route.ts:95,131`; `src/lib/hrefs.ts:9-14`
- **Root cause:** Any string is accepted as a primary key; web links interpolate raw ids.
- **Impact:** Path-like/very long ids break links, bloat rows, or cause unique-constraint 500s. No cross-user exposure found.
- **Fix:** Bounded ID regex; 400 on invalid; `encodeURIComponent` in web hrefs; consider `(userId,id)`.
- **Test:** Invalid/long ids → 400; href encoding test.
- **Effort:** S

## SEC-11 — Infra hints in errors and unauthenticated health metadata

- **Severity:** Low
- **Status:** CONFIRMED
- **Files:** `src/app/api/tasks/route.ts:58-64,115-121`; `src/app/api/sessions/route.ts:65-71,110-116`; `src/app/api/health/route.ts:3-5`
- **Root cause:** Errors disclose `DATABASE_URL`/`db:push` guidance; health exposes a phase string.
- **Impact:** Reconnaissance only.
- **Fix:** Generic error bodies; log details server-side; reduce/protect health.
- **Effort:** S

---

## Additional hardening findings

## SEC-12 — Weak/placeholder `NEXTAUTH_SECRET` is accepted; desktop secret falls back to it

- **Severity:** High (conditional on deployment)
- **Status:** CONFIRMED code / HYPOTHESIS deployment
- **Files:** `src/lib/auth.ts:13-18`; `.env.example:14`; `src/lib/desktop-auth.ts:30-34`; local `.env` (untracked) has a 23-char secret and no `DESKTOP_AUTH_SECRET`
- **Root cause:** Production guard only checks non-empty. `DESKTOP_AUTH_SECRET = env ?? NEXTAUTH_SECRET` shares the signing key. `.env.example` ships `change-me-in-production`.
- **Impact:** If deployed with the placeholder/weak secret, an attacker who knows it can forge a NextAuth session for any email (full account takeover) and forge desktop sync tokens.
- **Fix:** Reject placeholders and `<32` random bytes; require a separate `DESKTOP_AUTH_SECRET`; fail closed in production; rotate.
- **Test:** Startup guard rejects placeholder/short/empty; forged token with placeholder is not accepted.
- **Effort:** S

## SEC-13 — Login tokens are replayable and delivered in the URL

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/lib/desktop-auth.ts:24,36-54`; `start/route.ts:71-73`; `src-tauri/src/lib.rs:192-243`
- **Root cause:** No `jti`/one-time redemption; 120 s TTL; token in `?token=` (browser history); loopback response lacks `no-store`/`Referrer-Policy` and leaves the query in the address bar.
- **Impact:** Replay within 120 s mints multiple 30-day tokens; credential leak via history.
- **Fix:** One-time redemption (`jti` store), POST/form or fragment + `history.replaceState`, `no-store`, `no-referrer`.
- **Test:** Second exchange → 401; final URL contains no token; header assertions.
- **Effort:** M

## SEC-14 — Loopback accepts any localhost port with no client registration

- **Severity:** Medium
- **Status:** HYPOTHESIS exploit / CONFIRMED validation gap
- **Files:** `src/app/api/desktop/auth/start/route.ts:17-30`
- **Root cause:** Any `127.0.0.1`/`localhost` port + `/callback` is accepted; no `client_id`, registered redirect/port, or server-bound state.
- **Impact:** A local process can bind a port, lure a signed-in victim to the start URL, receive the login token, and exchange it (especially with SEC-02).
- **Fix:** Register the client/redirect (exact port or custom scheme); mandatory PKCE; server-side state/nonce binding; confirmation screen.
- **Test:** Unregistered redirect/port → 400; state not issued by server → 400.
- **Effort:** M/L

## SEC-15 — Web JWT sessions are stateless with no revocation (30-day default)

- **Severity:** Medium
- **Status:** CONFIRMED
- **Files:** `src/lib/auth.ts:17-25`; `prisma/schema.prisma` (no session table)
- **Root cause:** NextAuth JWT strategy without `maxAge`/denylist/session version.
- **Impact:** A stolen cookie remains valid until expiry even after sign-out; lost devices cannot be revoked.
- **Fix:** DB sessions or a session-version/denylist checked in `getCurrentUser`; shorter `maxAge`; sign-out-all.
- **Test:** Captured cookie rejected after revocation; `maxAge` assertion.
- **Effort:** M

## SEC-16 — Focus Guard helper privilege boundary

- **Severity:** High (hypothesis) / Medium (reliability)
- **Status:** CONFIRMED architecture / HYPOTHESIS exploit
- **Files:** `src-tauri/src/blocking.rs:147-183,208-240`; `src-tauri/src/lib.rs:378-393`
- **Root cause:** Elevated execution of a user-writable `%TEMP%\tempo-helper.ps1`; scheduled task runs `C:\ProgramData\Tempo\tempo-block.ps1` with highest privileges; paths are not quoted.
- **Impact:** Same-user low-integrity process could win the write/UAC race for admin execution; install fails for paths with spaces/apostrophes; webview XSS can trigger UAC/hosts changes.
- **Fix:** Signed helper binary or `-EncodedCommand`; admin-only verified path; strict ACLs; scope blocking commands to `main`.
- **Test:** ACL tamper test; quoted-path test; capability test.
- **Effort:** M/L

## SEC-17 — Other dependency advisories (dev/build chain)

- **Severity:** Low/Medium
- **Status:** CONFIRMED versions
- **Files:** `package.json:41-46`; lockfile (`postcss 8.4.31`, `source-map-js 1.2.1`, `vitest`, `tinypool`, eslint tooling)
- **Evidence:** full `npm audit` = 27 advisories (3 critical, 10 high, 14 moderate). PostCSS (XSS/arbitrary `.map` read) and `source-map-js` (event-loop DoS) are high; Vitest/tinypool critical are dev-only (no Vitest UI exposed).
- **Impact:** mainly build-chain/CI risk; dev-only advisories matter if the UI/API is ever exposed.
- **Fix:** upgrade Vitest ≥5.0.5, align eslint-config-next, let the Next upgrade pull patched postcss; CI audit gate.
- **Effort:** M

## SEC-18 — CSRF relies on defaults (low residual)

- **Severity:** Low
- **Status:** CONFIRMED absence / currently mitigated
- **Files:** mutating routes under `src/app/api/tasks`, `sessions`, `sync`
- **Root cause:** No explicit `Origin`/`Sec-Fetch-Site` check or CSRF token. NextAuth default cookie is `SameSite=Lax`; JSON bodies usually trigger preflight.
- **Impact:** If cookie policy changes to `SameSite=None` or a same-site origin is compromised, cross-site writes become possible.
- **Fix:** Enforce Origin/Sec-Fetch-Site on mutating routes or double-submit CSRF; explicitly configure cookie flags.
- **Test:** Disallowed Origin → 403; allowed → 200.
- **Effort:** S

## SEC-19 — Environment defaults and ignore rules

- **Severity:** Medium/Low
- **Status:** CONFIRMED
- **Files:** `.env.example:13-17`; `.gitignore:24-26`; `src/lib/desktop-auth.ts:30-34`
- **Root cause:** Example uses `http://localhost` and `change-me-in-production`; `DESKTOP_AUTH_SECRET=` is present-but-empty and the `??` fallback does not apply to `""` (throws); `.env.production` is not ignored (verified: `git check-ignore .env.production` returns nothing).
- **Impact:** Copy-paste deployments can run weak secrets over HTTP; desktop auth can 500; accidental commit of `.env.production` secrets.
- **Fix:** `.env*` + `!.env.example`; reject placeholders/short secrets and non-HTTPS URLs in production; use `||` fallback or require a separate secret.
- **Test:** Config-validation unit tests; CI ignore check.
- **Effort:** S

---

## Verified good controls (keep)

1. **No committed secrets.** `git ls-files` shows only `.env.example`; the only match for a credential pattern is the placeholder `postgresql://user:password@localhost...`. `.env` is ignored.
2. **No `NEXT_PUBLIC_*` secret leakage.** Only site URL, API base, and desktop flag are public.
3. **Tenant isolation.** Tasks/sessions/sync queries are scoped by `userId`; `/api/sync` overwrites `userId` from the authenticated user; session `taskId` is nulled if not owned. No IDOR found.
4. **No SQL injection.** No raw queries; Prisma parameterized API.
5. **Mass assignment blocked.** Explicit field whitelists on tasks/sessions/sync.
6. **No unsafe deserialization/eval.** `JSON.parse` guarded; no `eval`/`new Function`/`innerHTML`/`document.write`. The only `dangerouslySetInnerHTML` is static JSON-LD.
7. **JWT verification pinned.** `jose.jwtVerify` with `algorithms: ["HS256"]`, issuer/audience `tempo-desktop`, expiry, and 4096-byte cap.
8. **CORS exact allowlist.** Only `http(s)://tauri.localhost`/`tauri://localhost`, reflected only when allowed; no `*`, no credentials.
9. **Redirect safety.** `safeCallback`/login same-origin checks reject external callback URLs; loopback validation restricts scheme/host/path (remaining gap is port/client registration, SEC-14).
10. **Service worker never caches `/api`.**

## Recommended security order

1. Upgrade Next.js and add the dependency CI gate (SEC-01, SEC-17).
2. Require PKCE + add one-time login-token redemption (SEC-02, SEC-13).
3. Add revocable server-side sessions/tokens and real sign-out-all (SEC-03, SEC-15).
4. Owner-scope local data / stop auto-migration across accounts (SEC-04, SEC-07).
5. Encrypt-at-rest token storage + strict CSP + capability scoping (SEC-05, SEC-08).
6. Validate secrets/config at startup and fix env hygiene (SEC-12, SEC-19).
7. Rate-limit and cap inputs (SEC-06); harden the Focus Guard helper (SEC-16).
