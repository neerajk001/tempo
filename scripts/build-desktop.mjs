/**
 * Desktop (Tauri) static export.
 *
 * The web app is a Next.js server app (API routes + NextAuth). The desktop
 * build is fully local and static, so server-only routes can't be exported.
 * This script temporarily moves them out of `src/app`, runs `next build` with
 * `output: "export"`, then restores everything — even if the build fails.
 *
 * Excluded:
 *   - src/app/api            (all route handlers; desktop has no server)
 *   - src/app/tasks/[id]     (dynamic route; desktop uses /tasks/detail/?id=)
 *   - src/app/history/[id]   (dynamic route; desktop uses /history/detail/?id=)
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staging = join(root, ".desktop-exclude");

const MOVES = [
  ["src/app/api", "api"],
  ["src/app/tasks/[id]", "tasks-id"],
  ["src/app/history/[id]", "history-id"],
];

function relocate(fromRel, toRel) {
  const from = join(root, fromRel);
  const to = join(staging, toRel);
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

/**
 * Move any staged sources back. Returns false when a target already exists
 * (never delete the only copy). This runs in `finally` and before a new build.
 */
function restoreStaged() {
  let clean = true;
  for (const [fromRel, toRel] of MOVES) {
    const staged = join(staging, toRel);
    const target = join(root, fromRel);
    if (!existsSync(staged)) continue;
    if (existsSync(target)) {
      clean = false;
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    renameSync(staged, target);
  }
  return clean;
}

console.log("[desktop] syncing focus library");
execSync("node scripts/sync-focus-library.mjs", { stdio: "inherit", cwd: root });

if (existsSync(staging)) {
  console.warn("[desktop] leftover .desktop-exclude found; restoring before build");
  if (!restoreStaged()) {
    throw new Error(
      "Cannot safely rebuild: .desktop-exclude contains sources while the target already exists. Restore it manually."
    );
  }
  rmSync(staging, { recursive: true, force: true });
}

try {
  for (const [fromRel, toRel] of MOVES) relocate(fromRel, toRel);

  console.log("[desktop] building static export -> out/");
  execSync("next build", {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      TEMPO_DESKTOP: "1",
      NEXT_PUBLIC_DESKTOP: "1",
      // Absolute origin used by the desktop app for sign-in and sync.
      NEXT_PUBLIC_API_BASE:
        process.env.NEXT_PUBLIC_API_BASE ?? "https://tempo.neerajx.site",
    },
  });
} finally {
  restoreStaged();
  // Only remove staging when every source was restored; otherwise keep the
  // backup so an interrupted build can be recovered manually.
  if (restoreStaged()) {
    rmSync(staging, { recursive: true, force: true });
  }
}
