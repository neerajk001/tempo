/**
 * True when compiling the local-only desktop (Tauri) bundle.
 * Inlined at build time via NEXT_PUBLIC_DESKTOP=1.
 */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";
