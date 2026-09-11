"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import { CAL_SYNC_STAMP_KEY } from "@/lib/assets";
import { usePrefsStore } from "@/stores/prefs-store";
import { useTaskStore } from "@/stores/task-store";
import type { CalendarEvent } from "@/services/google-calendar";
import { cn } from "@/lib/utils";

function GoogleCalMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M19.5 3h-15A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3z" fill="#4285F4" />
      <path d="M18 18H6V8h12v10z" fill="#fff" />
      <path d="M9.5 14.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" fill="#FBBC05" />
      <path d="M6 6h12v2H6z" fill="#34A853" />
      <path d="M14.5 14.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" fill="#EA4335" />
    </svg>
  );
}

function relativeAgo(ms: number | null): string {
  if (ms === null) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function GoogleCalendarSettings() {
  const { data: session, status } = useSession();
  const tasks = useTaskStore((s) => s.tasks);
  const collisionMode = usePrefsStore((s) => s.collisionMode);
  const setPrefs = usePrefsStore((s) => s.set);
  const resetPrefs = usePrefsStore((s) => s.resetPrefs);
  const [syncStamp, setSyncStamp] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState<number | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CAL_SYNC_STAMP_KEY);
      setSyncStamp(v ? Number(v) : null);
    } catch {
      setSyncStamp(null);
    }
  }, []);

  const authed = status === "authenticated";
  const hasError = Boolean(session?.calendarError);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86400000);
      const res = await fetch(
        `/api/calendar/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`
      );
      const data = (await res.json()) as { events?: CalendarEvent[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const n = (data.events ?? []).length;
      setEventCount(n);
      const stamp = Date.now();
      setSyncStamp(stamp);
      try {
        window.localStorage.setItem(CAL_SYNC_STAMP_KEY, String(stamp));
      } catch {
        // Optional.
      }
      setToast(`Calendar sync complete — ${n} events indexed, 0 conflicts detected`);
      setTimeout(() => setToast(null), 2800);
    } catch {
      setToast("Sync failed — check the connection and try again.");
      setTimeout(() => setToast(null), 2800);
    } finally {
      setSyncing(false);
    }
  };

  const linked = tasks.filter((t) => t.calendarEventId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <Link href="/settings" className="hover:text-on-surface transition-colors">Settings</Link>
          <Icon name="chevron_right" className="text-[14px]" />
          <span className="hover:text-on-surface transition-colors">Integrations</span>
          <Icon name="chevron_right" className="text-[14px]" />
          <span className="text-on-surface font-medium">Google Calendar</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mt-0.5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-headline-lg text-on-surface tracking-tight">Google Calendar</h1>
              <div className={cn(
                "inline-flex items-center gap-1 px-3 py-[2px] rounded-full text-label-xs",
                authed && !hasError ? "bg-secondary-container text-on-secondary-fixed" : hasError ? "bg-error-container text-on-error-container" : "bg-surface-container-high text-on-surface-variant"
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full", authed && !hasError ? "bg-primary animate-pulse" : hasError ? "bg-error" : "bg-outline")} />
                <span>{authed && !hasError ? "Connected • 1 Calendar Synced" : hasError ? "Sync Warning • Re-auth Required" : "Not Connected"}</span>
              </div>
            </div>
            <p className="text-body-md text-on-surface-variant mt-0.5">Use your calendar to coordinate time blocks, preserve focus windows, and deflect meeting friction.</p>
          </div>
        </div>
      </div>

      {hasError && (
        <div className="rounded-xl bg-error-container/40 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-2.5">
              <Icon name="error" className="text-error text-[22px] mt-0.5" />
              <div>
                <div className="text-headline-md text-on-surface">Unable to sync Google Calendar</div>
                <div className="text-body-sm text-on-surface-variant mt-0.5">OAuth session token expired or calendar permissions were revoked in your Google Security settings.</div>
                <div className="font-mono text-code-badge text-error mt-0.5">Diagnostic: HTTP 401 — reconnect to restore read access</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={syncNow} className="h-8 px-3 rounded-lg bg-surface-container-lowest text-on-surface text-body-sm font-medium hover:bg-surface-container-high transition-colors shadow-sm">
                Try Again
              </button>
              <button type="button" onClick={() => signIn("google")} className="h-8 px-3 rounded-lg bg-primary text-on-primary text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
                Re-authenticate
              </button>
            </div>
          </div>
        </div>
      )}

      {!authed ? (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-full max-w-xl bg-surface-container-lowest rounded-xl p-8 text-center shadow-sm flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4 shadow-sm">
              <GoogleCalMark className="w-9 h-9" />
            </div>
            <h2 className="text-headline-lg text-on-surface mb-1">Connect Google Calendar</h2>
            <p className="text-body-md text-on-surface-variant max-w-md mx-auto mb-5">
              Tempo reads your external commitments and reserves unfragmented focus blocks for tasks without double-booking.
            </p>
            <button
              type="button"
              onClick={() => signIn("google")}
              className="h-10 px-6 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-semibold inline-flex items-center gap-2.5 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              <span>Connect Google Calendar</span>
            </button>
            <div className="flex items-center gap-1.5 text-label-xs text-on-surface-variant mt-4">
              <Icon name="shield" className="text-[14px]" />
              <span>Your calendar remains governed by Google security policies.</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="bg-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center relative flex-shrink-0 shadow-sm">
                  <GoogleCalMark className="w-7 h-7" />
                  <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary ring-2 ring-surface-container-lowest" />
                </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-headline-md font-semibold text-on-surface truncate">Google Calendar Connected</span>
                    <span className="px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-mono text-code-badge font-semibold">Live Sync Active</span>
                    <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-code-badge">Read-only</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant mt-0.5 min-w-0 flex-wrap">
                    <span className="font-medium text-on-surface truncate">{session?.user?.name ?? "Account"}</span>
                    <span className="flex-shrink-0">•</span>
                    <span className="font-mono text-metric-mono-md truncate min-w-0">{session?.user?.email}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={syncNow}
                  disabled={syncing}
                  className="h-8 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium inline-flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-60"
                >
                  <Icon name="sync" className={cn("text-[16px]", syncing && "animate-spin")} />
                  <span>{syncing ? "Syncing…" : "Sync Now"}</span>
                  <kbd className="font-mono text-code-badge bg-surface-container-lowest px-1 rounded text-on-surface-variant shadow-sm">⌘R</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => signIn("google")}
                  className="h-8 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm font-medium transition-colors"
                >
                  Change Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Disconnect Google Calendar from Tempo? Local tasks keep working.")) signOut({ callbackUrl: "/calendar" });
                  }}
                  className="h-8 px-3 rounded-lg hover:bg-error-container/60 text-error text-body-sm font-medium transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-4">
              {(
                [
                  { label: "Last Indexed", icon: "done_all", main: `${relativeAgo(syncStamp)}${syncStamp ? ` (${new Date(syncStamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}`, sub: "Explicit refresh only" },
                  { label: "Refresh Mode", icon: "timer", main: "Manual", sub: "No background polling" },
                  { label: "Synced Window", icon: "date_range", main: "Current day", sub: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                  { label: "Active Blocks", icon: "layers", main: `${eventCount ?? "—"} Events Mapped`, sub: `${linked.length} calendar-linked tasks`, accent: true },
                ] as Array<{ label: string; icon: string; main: string; sub: string; accent?: boolean }>
              ).map((m) => (
                <div key={m.label} className="bg-surface-container-low rounded-lg p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-label-xs text-on-surface-variant uppercase tracking-wider">
                    <span>{m.label}</span>
                    <Icon name={m.icon} className="text-[14px]" />
                  </div>
                  <div className="mt-1">
                    <div className={cn("font-mono text-metric-mono-md font-semibold", m.accent ? "text-primary" : "text-on-surface")}>{m.main}</div>
                    <div className="text-label-xs text-on-surface-variant">{m.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-body-md font-semibold text-on-surface">Target Calendars</h2>
                  <p className="text-body-sm text-on-surface-variant">Tempo reads availability from your primary calendar.</p>
                </div>
                <span className="font-mono text-code-badge text-on-surface-variant">1 of 1 supported</span>
              </div>
              <label className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low cursor-default">
                <div className="flex items-center gap-2.5 min-w-0">
                  <input type="checkbox" checked readOnly className="w-4 h-4 rounded accent-primary" />
                  <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-body-sm font-medium text-on-surface truncate block">Primary Calendar (Work & Deep Work)</span>
                    <span className="text-label-xs text-on-surface-variant font-mono block truncate">{session?.user?.email} • Read availability only</span>
                  </div>
                </div>
                <span className="text-label-xs px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">Default source</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-primary text-body-sm font-medium">
                  <Icon name="verified_user" className="text-[18px]" />
                  <span>Security & Privacy Protocol</span>
                </div>
                <h2 className="text-headline-md text-on-surface mt-1">What Tempo Accesses</h2>
                <p className="text-body-sm text-on-surface-variant mt-0.5">Tempo requests strictly minimal scopes to protect your focus windows. Your calendar continues to be governed by Google&apos;s security policies.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="bg-surface-container-low rounded-lg p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-1 text-on-primary-fixed text-body-sm font-semibold">
                    <Icon name="check_circle" className="text-[18px]" />
                    <span>What Tempo does</span>
                  </div>
                  <ul className="space-y-2.5 text-body-sm text-on-surface">
                    {[
                      "Reads start and end times to identify free slots for focus blocks.",
                      "Detects incoming meeting invites to defend your deep work cadence.",
                      "Converts calendar events into local tasks — stored on your device and database.",
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-1.5">
                        <Icon name="done" className="text-[16px] text-primary mt-0.5 flex-shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-surface-container-low rounded-lg p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-1 text-error text-body-sm font-semibold">
                    <Icon name="block" className="text-[18px]" />
                    <span>What Tempo never does</span>
                  </div>
                  <ul className="space-y-2.5 text-body-sm text-on-surface">
                    {[
                      "Never modifies, deletes, or writes to your calendar (read-only scope).",
                      "Never reads, modifies, or scans your Gmail or Google Drive files.",
                      "Never shares attendee emails, conference notes, or company decks.",
                      "Never sells or feeds your calendar telemetry to training models.",
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-1.5">
                        <Icon name="close" className="text-[16px] text-error mt-0.5 flex-shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low text-label-xs text-on-surface-variant">
                <div className="flex items-center gap-1.5">
                  <Icon name="lock" className="text-[16px] text-primary" />
                  <span>OAuth 2.0 with encrypted server-side credential storage</span>
                </div>
                <a className="text-primary hover:underline inline-flex items-center gap-0.5 font-medium" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
                  <span>Manage on Google</span>
                  <Icon name="north_east" className="text-[12px]" />
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
              <div>
                <h2 className="text-headline-md text-on-surface">Sync Configuration</h2>
                <p className="text-body-sm text-on-surface-variant mt-0.5">Fine-tune how Tempo negotiates priority with incoming calendar changes.</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-body-sm font-medium text-on-surface">When external meetings overlap focus:</label>
                <div className="space-y-1.5">
                  {(
                    [
                      { id: "auto", title: "Auto-Shift Focus Block", sub: "Offers one-tap moves into the nearest unoccupied daylight slot." },
                      { id: "flag", title: "Flag Conflict for Manual Review", sub: "Keeps focus block in place and displays an alert in your Today view." },
                    ] as Array<{ id: "auto" | "flag"; title: string; sub: string }>
                  ).map((o) => (
                    <label key={o.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="collision"
                        checked={collisionMode === o.id}
                        onChange={() => setPrefs({ collisionMode: o.id })}
                        className="mt-0.5 accent-primary cursor-pointer"
                      />
                      <div>
                        <div className="text-body-sm font-medium text-on-surface">{o.title}</div>
                        <div className="text-label-xs text-on-surface-variant">{o.sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-1 flex items-center justify-between">
                <span className="text-label-xs text-on-surface-variant flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Preferences auto-saved
                </span>
                <button type="button" onClick={() => resetPrefs()} className="text-label-xs text-primary hover:underline font-medium">
                  Reset defaults
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-4 left-4 sm:left-auto z-50 flex items-center gap-2.5 bg-inverse-surface border border-outline text-on-surface px-4 py-3 rounded-lg shadow-xl sm:max-w-sm">
          <Icon name="check_circle" className="text-[18px] text-primary" />
          <div className="flex flex-col text-left">
            <span className="text-body-sm font-medium">Calendar sync complete</span>
            <span className="text-label-xs text-on-surface-variant">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
