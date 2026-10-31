import { IS_DESKTOP } from "@/lib/platform";

/**
 * Origin of the cloud API.
 *
 * On the web this is empty (same-origin). The desktop bundle is served from
 * `tauri.localhost`, so it needs the absolute site URL; the value is inlined
 * at build time by scripts/build-desktop.mjs.
 */
export const API_BASE = IS_DESKTOP
  ? process.env.NEXT_PUBLIC_API_BASE || "https://tempo.neerajx.site"
  : "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
