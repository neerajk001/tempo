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

console.log("[desktop] syncing focus library");
execSync("node scripts/sync-focus-library.mjs", { stdio: "inherit", cwd: root });

try {
  rmSync(staging, { recursive: true, force: true });
  for (const [fromRel, toRel] of MOVES) relocate(fromRel, toRel);

  console.log("[desktop] building static export -> out/");
  execSync("next build", {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, TEMPO_DESKTOP: "1", NEXT_PUBLIC_DESKTOP: "1" },
  });
} finally {
  for (const [fromRel, toRel] of MOVES) {
    const staged = join(staging, toRel);
    const target = join(root, fromRel);
    if (existsSync(staged)) {
      mkdirSync(dirname(target), { recursive: true });
      renameSync(staged, target);
    }
  }
  rmSync(staging, { recursive: true, force: true });
}
