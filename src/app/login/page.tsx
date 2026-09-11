"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

function TempoGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15" y2="15" />
    </svg>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated" && !!session?.user;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Enter" && status === "unauthenticated") {
        e.preventDefault();
        signIn("google", { callbackUrl: "/" });
      } else if (e.code === "Escape") {
        router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, router]);

  return (
    <div className="fixed inset-0 z-50 bg-surface text-on-surface flex flex-col justify-between overflow-y-auto">
      {/* Top system status bar */}
      <header className="w-full px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm">
            <TempoGlyph className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-on-surface">Tempo</span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-on-surface-variant ml-1.5 px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container-low">v2.4</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-on-surface-variant">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-on-surface-variant font-medium">All systems operational</span>
          </div>
        </div>
      </header>

      {/* Centered authentication stage */}
      <main className="w-full flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[440px] flex flex-col items-center text-center">
          {/* Brand monogram */}
          <div className="relative mb-8 group">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm flex items-center justify-center transition-all duration-300 group-hover:border-primary/40" style={{ boxShadow: "0 0 32px rgba(127,176,105,0.12)" }}>
              <svg className="w-8 h-8 text-primary" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.75" strokeDasharray="2 3" opacity="0.4" />
                <path d="M16 6V16L22 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="16" cy="16" r="2.5" fill="currentColor" />
              </svg>
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-surface flex items-center justify-center shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-on-primary" />
            </span>
          </div>

          {/* Wordmark & scope */}
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-base font-semibold tracking-tight text-on-surface">Tempo</span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-on-primary-fixed bg-primary-fixed px-2 py-0.5 rounded-full border border-primary/20">Personal Console</span>
          </div>

          <h1 className="text-2xl sm:text-[28px] font-semibold text-on-surface tracking-[-0.025em] leading-snug mb-3">
            Focus on the work that matters.
          </h1>
          <p className="text-[14.5px] leading-relaxed text-on-surface-variant font-normal max-w-[380px] mb-8">
            Plan your time, run focused sessions, and understand where your day actually went.
          </p>

          {/* Interaction card */}
          <div className="w-full bg-surface-container-lowest border border-outline-variant rounded-2xl p-7 shadow-sm text-left">
            {status === "loading" ? (
              <p className="text-sm text-on-surface-variant text-center py-3">Checking session…</p>
            ) : signedIn ? (
              <div className="text-center">
                <p className="text-sm font-medium text-on-surface">
                  Signed in as {session?.user?.email ?? session?.user?.name}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Your workspace is synced and protected.
                </p>
                <div className="mt-4 flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-[14px] transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    Open console
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="px-5 py-2.5 rounded-xl bg-surface-container border border-outline-variant text-on-surface font-medium text-[14px] hover:bg-surface-container-high transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: "/" })}
                  className="w-full group relative flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-primary hover:bg-primary-container active:brightness-95 text-on-primary font-semibold text-[14.5px] shadow-sm hover:shadow transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <GoogleGlyph className="w-4 h-4 bg-white rounded-full p-[1px] flex-shrink-0" />
                  <span>Continue with Google</span>
                  <span className="text-xs font-mono text-on-primary/60 group-hover:text-on-primary ml-1 transition-colors">↵</span>
                </button>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-outline-variant" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-surface-container-lowest px-2.5 text-on-surface-variant font-mono text-[11px] uppercase tracking-wider">Workspace Sync</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface-variant">
                  <div className="w-7 h-7 rounded-lg bg-primary-fixed border border-primary/20 flex items-center justify-center flex-shrink-0 text-primary mt-0.5">
                    <CalendarIcon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-xs leading-relaxed text-on-surface font-medium">
                      Connect Google Calendar to bring your planned work into Tempo.
                    </p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      Read-only availability inspection and deliberate focus block protection.
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-outline-variant flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <LockIcon className="w-3.5 h-3.5" />
                  OAuth 2.0 AES-256 Encrypted
                </div>
              </>
            )}
          </div>

          {!signedIn && status !== "loading" && (
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-on-surface-variant">
              <span>Press</span>
              <kbd className="px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container-lowest font-mono text-[11px] text-on-surface">Enter ↵</kbd>
              <span>to continue with default account</span>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full px-8 py-5 flex flex-col sm:flex-row items-center justify-between text-xs text-on-surface-variant border-t border-outline-variant">
        <div className="flex items-center gap-3 mb-2 sm:mb-0">
          <span>Tempo Technologies Inc.</span>
          <span className="text-outline">•</span>
          <span>Designed for deep work</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="font-mono text-[11px] text-on-surface-variant">ESC to exit</span>
        </div>
      </footer>
    </div>
  );
}
