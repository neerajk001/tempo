/**
 * CORS for the desktop app.
 *
 * The Tauri webview runs on `http://tauri.localhost` (Windows) or
 * `tauri://localhost` (macOS/Linux), so API routes it calls directly need
 * explicit cross-origin permission. Only those shells are allowed; a regular
 * website cannot spoof its Origin header.
 */
const ALLOWED_ORIGINS = new Set([
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
]);

export function desktopCors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
