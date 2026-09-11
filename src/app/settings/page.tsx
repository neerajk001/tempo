"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { usePrefsStore, type ChimeTheme, type TimerStyle } from "@/stores/prefs-store";
import { useTaskStore } from "@/stores/task-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { useDiversionStore } from "@/stores/diversion-store";
import { playChime } from "@/lib/chime";
import { setNotifyEnabled } from "@/lib/notifications";
import { syncNow } from "@/lib/sync";
import { useSyncStore } from "@/stores/sync-store";
import { CAL_SYNC_STAMP_KEY } from "@/lib/assets";
import { cn } from "@/lib/utils";

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none",
        on ? "bg-primary" : "bg-surface-variant"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ml-0.5",
          on ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function Stepper({ value, unit, onStep, min, max, disabled }: { value: number; unit: string; onStep: (d: number) => void; min: number; max: number; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between bg-surface-container-lowest px-3 py-1.5 rounded shadow-sm">
      <button type="button" disabled={disabled} onClick={() => onStep(-1)} className="text-on-surface-variant hover:text-primary disabled:opacity-40">
        <Icon name="remove" className="text-[18px]" />
      </button>
      <span className="font-mono text-metric-mono-md font-semibold text-on-surface">{value} {unit}</span>
      <button type="button" disabled={disabled} onClick={() => onStep(1)} className="text-on-surface-variant hover:text-primary disabled:opacity-40">
        <Icon name="add" className="text-[18px]" />
      </button>
    </div>
  );
}

const NAV = [
  { id: "section-focus", label: "Focus Rhythm", icon: "timer" },
  { id: "section-notifications", label: "Audio & Alerts", icon: "notifications_active" },
  { id: "section-appearance", label: "Appearance", icon: "palette" },
  { id: "section-calendar", label: "Calendar & Sync", icon: "sync_alt" },
  { id: "section-privacy", label: "Data & Privacy", icon: "shield" },
  { id: "section-shortcuts", label: "Shortcuts", icon: "keyboard" },
];

export default function SettingsPage() {
  const { data: session, status: authStatus } = useSession();
  const syncing = useSyncStore((s) => s.syncing);
  const syncError = useSyncStore((s) => s.error);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const { config, setConfig, session: pomoSession } = usePomodoroStore();
  const prefs = usePrefsStore();
  const [activeNav, setActiveNav] = useState("section-focus");
  const [resetNote, setResetNote] = useState<string | null>(null);
  const [permNote, setPermNote] = useState<string | null>(null);

  const mins = (ms: number) => Math.round(ms / 60000);
  const editingLocked = pomoSession.status === "RUNNING" || pomoSession.status === "PAUSED";

  const setMins = (key: "focusMs" | "shortBreakMs" | "longBreakMs", deltaMin: number, min: number, max: number) => {
    const cur = mins(config[key]);
    const next = Math.min(max, Math.max(min, cur + deltaMin));
    setConfig({ [key]: next * 60000 } as Partial<typeof config>);
  };

  const toggleNotify = async (kind: "notifyFocus" | "notifyBreak") => {
    if (prefs[kind]) {
      prefs.set({ [kind]: false } as Partial<typeof prefs>);
      // Keep the legacy global flag in sync (harmless, used by older builds).
      if (!prefs.notifyFocus && !prefs.notifyBreak) setNotifyEnabled(false);
      return;
    }
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied") {
        setPermNote("Browser notifications are blocked — allow them in site settings first.");
        return;
      }
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted") {
        const res = await Notification.requestPermission();
        if (res !== "granted") {
          setPermNote("Permission not granted — alerts stay off.");
          return;
        }
      }
      setPermNote(null);
      prefs.set({ [kind]: true } as Partial<typeof prefs>);
      setNotifyEnabled(true);
    } catch {
      setPermNote("Could not enable notifications in this browser.");
    }
  };

  const exportJSON = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      tasks: useTaskStore.getState().tasks,
      sessions: useSessionHistoryStore.getState().sessions,
      diversions: useDiversionStore.getState().diversions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tempo-archive.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const rows = useSessionHistoryStore.getState().sessions;
    const head = "date,task,focus_min,paused_min,interruptions,status";
    const lines = rows.map((r) => {
      const d = new Date(r.startedAt);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const title = `"${(r.taskTitle ?? "Focus Session").replace(/"/g, '""')}"`;
      return [date, title, Math.round(r.focusedMs / 60000), Math.round(r.pausedMs / 60000), r.interruptions, r.status].join(",");
    });
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tempo-metrics.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLocal = () => {
    if (!window.confirm("Clear local Tempo data on this device? Database records are preserved.")) return;
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("tempo-"))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // Ignore.
    }
    window.location.reload();
  };

  const resetDefaults = () => {
    setConfig({ focusMs: 50 * 60000, shortBreakMs: 10 * 60000, longBreakMs: 30 * 60000, longBreakInterval: 4 });
    prefs.resetPrefs();
    setResetNote("Restored defaults");
    setTimeout(() => setResetNote(null), 1500);
  };

  let syncLabel = "Never synced";
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(CAL_SYNC_STAMP_KEY) : null;
    if (v) {
      const s = Math.floor((Date.now() - Number(v)) / 1000);
      syncLabel = s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} minutes ago` : `${Math.floor(s / 3600)} hours ago`;
    }
  } catch {
    // Ignore.
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-on-surface-variant text-label-xs tracking-wider uppercase">
            <span>Preferences & System</span>
            <span className="text-outline/40">/</span>
            <span className="text-primary font-semibold">Workspace Configuration</span>
          </div>
          <h1 className="text-display-xl text-on-surface tracking-tight">Settings</h1>
          <p className="text-body-md text-on-surface-variant">Configure Tempo around the way you work.</p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-end">
          <div className="flex items-center gap-1.5 px-3 py-0.5 rounded bg-surface-container text-on-surface-variant text-label-xs">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>{resetNote ?? "All changes saved locally"}</span>
          </div>
          <button type="button" onClick={resetDefaults} className="px-4 h-8 rounded bg-surface-container-low hover:bg-surface-container text-on-surface transition-colors text-body-sm font-medium">
            Reset to Defaults
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <nav className="lg:col-span-3 flex lg:flex-col gap-0.5 lg:sticky lg:top-20 bg-surface-container-lowest/80 backdrop-blur p-1.5 rounded-xl shadow-sm z-10 overflow-x-auto">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              onClick={() => setActiveNav(n.id)}
              className={cn(
                "flex items-center gap-3 px-3 h-9 rounded-lg transition-colors whitespace-nowrap",
                activeNav === n.id
                  ? "bg-secondary-container text-on-surface text-headline-md font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface text-body-sm font-medium"
              )}
            >
              <Icon name={n.icon} className={cn("text-[18px]", activeNav === n.id && "text-primary")} />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>

        <div className="lg:col-span-9 flex flex-col gap-8">
          {/* Focus Rhythm */}
          <section id="section-focus" className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 sm:p-6 flex flex-col gap-4 scroll-mt-24">
            <div className="flex items-center justify-between pb-1">
              <div className="flex flex-col">
                <h2 className="text-headline-lg text-on-surface tracking-tight">Focus Rhythm & Cadence</h2>
                <p className="text-body-sm text-on-surface-variant">Calibrate standard pomodoro interval blocks, recovery cycles, and automation boundaries.</p>
              </div>
              <span className="font-mono text-code-badge px-1.5 py-0.5 bg-surface-container text-on-secondary-fixed rounded font-medium hidden sm:inline">PRECISION ENGINE</span>
            </div>
            <div className="flex flex-col md:flex-row md:items-center justify-between py-2 gap-3 bg-surface-container-low/50 p-3 rounded-lg">
              <div className="flex flex-col">
                <span className="text-headline-md text-on-surface font-semibold">Focus duration</span>
                <span className="text-body-sm text-on-surface-variant">Length of uninterrupted sprint before mandatory recovery window.</span>
              </div>
              <div className="flex items-center gap-0.5 bg-surface-container-lowest border border-outline-variant p-0.5 rounded-lg shadow-sm flex-wrap">
                {[25, 45, 50, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={editingLocked}
                    onClick={() => setConfig({ focusMs: m * 60000 })}
                    className={cn(
                      "px-3 py-0.5 rounded font-mono text-code-badge disabled:opacity-40",
                      mins(config.focusMs) === m ? "bg-primary text-on-primary font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                    )}
                  >
                    {m}m
                  </button>
                ))}
                <div className="h-4 w-px bg-surface-variant mx-0.5" />
                <div className="flex items-center px-1.5 font-mono text-metric-mono-md text-on-surface">
                  <span className="text-on-surface-variant text-[11px] uppercase mr-1">Custom:</span>
                  <span className="font-semibold">{mins(config.focusMs)} min</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(
                [
                  { label: "Short break", sub: "Rapid rest interval", key: "shortBreakMs", min: 1, max: 60 },
                  { label: "Long break", sub: "Deep cognitive reset", key: "longBreakMs", min: 5, max: 90 },
                ] as Array<{ label: string; sub: string; key: "shortBreakMs" | "longBreakMs"; min: number; max: number }>
              ).map((b) => (
                <div key={b.key} className="flex flex-col justify-between p-4 rounded-lg bg-surface-container-low/50">
                  <span className="text-headline-md text-on-surface">{b.label}</span>
                  <span className="text-body-sm text-on-surface-variant mb-2">{b.sub}</span>
                  <Stepper value={mins(config[b.key])} unit="min" min={b.min} max={b.max} disabled={editingLocked} onStep={(d) => setMins(b.key, d, b.min, b.max)} />
                </div>
              ))}
              <div className="flex flex-col justify-between p-4 rounded-lg bg-surface-container-low/50">
                <span className="text-headline-md text-on-surface">Long break interval</span>
                <span className="text-body-sm text-on-surface-variant mb-2">Sessions before deep reset</span>
                <div className="flex items-center justify-between bg-surface-container-lowest px-3 py-1.5 rounded shadow-sm">
                  <button
                    type="button"
                    disabled={editingLocked || config.longBreakInterval <= 2}
                    onClick={() => setConfig({ longBreakInterval: config.longBreakInterval - 1 })}
                    className="text-on-surface-variant hover:text-primary disabled:opacity-40"
                  >
                    <Icon name="remove" className="text-[18px]" />
                  </button>
                  <span className="font-mono text-metric-mono-md font-semibold text-on-surface">After {config.longBreakInterval}</span>
                  <button
                    type="button"
                    disabled={editingLocked || config.longBreakInterval >= 12}
                    onClick={() => setConfig({ longBreakInterval: config.longBreakInterval + 1 })}
                    className="text-on-surface-variant hover:text-primary disabled:opacity-40"
                  >
                    <Icon name="add" className="text-[18px]" />
                  </button>
                </div>
              </div>
            </div>
            {editingLocked && <p className="text-xs text-accent-amber">Pause or complete the running session to edit cadence.</p>}
            <div className="flex flex-col gap-0.5 mt-0.5">
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-surface-container-low transition-colors">
                <div className="flex flex-col pr-4 min-w-0">
                  <span className="text-body-md font-semibold text-on-surface">Automatically start breaks</span>
                  <span className="text-body-sm text-on-surface-variant">Transitions into rest mode without manual intervention upon completion.</span>
                </div>
                <Toggle on={prefs.autoStartBreaks} onClick={() => prefs.set({ autoStartBreaks: !prefs.autoStartBreaks })} label="Automatically start breaks" />
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-surface-container-low transition-colors">
                <div className="flex flex-col pr-4 min-w-0">
                  <span className="text-body-md font-semibold text-on-surface">Automatically start next focus session</span>
                  <span className="text-body-sm text-on-surface-variant">
                    Requires deliberate keypress <kbd className="font-mono text-code-badge bg-surface-container px-1 py-0.5 rounded shadow-sm">Space</kbd> to begin subsequent deep work block.
                  </span>
                </div>
                <Toggle on={prefs.autoStartFocus} onClick={() => prefs.set({ autoStartFocus: !prefs.autoStartFocus })} label="Automatically start next focus session" />
              </div>
            </div>
          </section>

          {/* Audio & Alerts */}
          <section id="section-notifications" className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 sm:p-6 flex flex-col gap-4 scroll-mt-24">
            <div className="flex flex-col pb-1">
              <h2 className="text-headline-lg text-on-surface tracking-tight">Audio & Dispatch Alerts</h2>
              <p className="text-body-sm text-on-surface-variant">Configure discrete auditory feedback and system notifications designed for minimal distraction.</p>
            </div>
            <div className="flex flex-col gap-0.5">
              {(
                [
                  { key: "notifyFocus", icon: "check_circle", title: "Pomodoro completed", sub: "Subtle chime sound plus desktop system banner notification." },
                  { key: "notifyBreak", icon: "coffee", title: "Break completed", sub: "Gentle audio cue reminding you when rest interval expires." },
                  { key: "reviewPrompt", icon: "rate_review", title: "Daily review prompt", sub: "Shows an end-of-day review nudge on the dashboard after 18:30 local time." },
                ] as Array<{ key: "notifyFocus" | "notifyBreak" | "reviewPrompt"; icon: string; title: string; sub: string }>
              ).map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-surface-container-low transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary">
                      <Icon name={row.icon} className="text-[18px]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-body-md font-semibold text-on-surface">{row.title}</span>
                      <span className="text-body-sm text-on-surface-variant">{row.sub}</span>
                    </div>
                  </div>
                  <Toggle
                    on={prefs[row.key]}
                    onClick={() => (row.key === "reviewPrompt" ? prefs.set({ reviewPrompt: !prefs.reviewPrompt }) : toggleNotify(row.key))}
                    label={row.title}
                  />
                </div>
              ))}
            </div>
            {permNote && <p className="text-xs text-accent-amber">{permNote}</p>}
            <div className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg bg-surface-container-low/50 gap-3 mt-0.5">
              <div className="flex flex-col">
                <span className="text-headline-md text-on-surface">Sound theme preview</span>
                <span className="text-body-sm text-on-surface-variant">Select frequency profiles tailored for headphone or speaker environments.</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={prefs.chimeTheme}
                  onChange={(e) => prefs.set({ chimeTheme: e.target.value as ChimeTheme })}
                  className="h-8 px-3 bg-surface-container-lowest border border-outline-variant rounded text-on-surface text-body-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="chime">Minimal Chime</option>
                  <option value="marimba">Natural Marimba</option>
                  <option value="bell">Muted Bell</option>
                  <option value="muted">Haptic Tap (Muted)</option>
                </select>
                <button
                  type="button"
                  onClick={() => playChime(prefs.chimeTheme)}
                  className="h-8 px-3 bg-surface-container hover:bg-surface-container-high rounded text-on-surface font-mono text-code-badge flex items-center gap-1 transition-colors"
                >
                  <Icon name="play_arrow" className="text-[16px]" />
                  <span>Test Audio</span>
                </button>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section id="section-appearance" className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 sm:p-6 flex flex-col gap-4 scroll-mt-24">
            <div className="flex flex-col pb-1">
              <h2 className="text-headline-lg text-on-surface tracking-tight">Appearance & Density</h2>
              <p className="text-body-sm text-on-surface-variant">Adjust visual theme, row rhythm, and status bar presence.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative flex flex-col p-4 rounded-xl bg-surface-container cursor-pointer shadow-sm ring-2 ring-primary">
                <div className="h-20 w-full rounded-lg bg-surface border border-outline-variant shadow-sm flex flex-col p-1.5 gap-1 overflow-hidden">
                  <div className="h-2 w-1/3 bg-primary/40 rounded" />
                  <div className="h-2 w-2/3 bg-surface-variant rounded" />
                  <div className="h-2 w-1/2 bg-surface-variant rounded" />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-headline-md text-on-surface font-semibold">Light Mode</span>
                  <Icon name="check_circle" className="text-[18px] text-primary" />
                </div>
                <span className="text-body-sm text-on-surface-variant">Precision high contrast</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-surface-container-low/50 gap-3">
              <div className="flex flex-col">
                <span className="text-headline-md text-on-surface font-semibold">Focus timer style</span>
                <span className="text-body-sm text-on-surface-variant">Circular, flip clock, or analog — same Pomodoro countdown, different face.</span>
              </div>
              <div className="flex items-center bg-surface-container-lowest border border-outline-variant p-0.5 rounded-lg shadow-sm self-start sm:self-auto">
                {(
                  [
                    { id: "circular", label: "Circular" },
                    { id: "flip", label: "Flip Clock" },
                    { id: "analog", label: "Analog" },
                  ] as Array<{ id: TimerStyle; label: string }>
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => prefs.set({ timerStyle: t.id })}
                    className={cn(
                      "px-3 py-1 rounded-md text-body-sm transition-colors whitespace-nowrap",
                      prefs.timerStyle === t.id
                        ? "bg-primary text-on-primary font-semibold shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface font-medium"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low/50">
              <div className="flex flex-col">
                <span className="text-headline-md text-on-surface font-semibold">Compact density table rows</span>
                <span className="text-body-sm text-on-surface-variant">Reduces row spacing to 28px for high-information density timelines.</span>
              </div>
              <Toggle on={prefs.compact} onClick={() => prefs.set({ compact: !prefs.compact })} label="Compact density table rows" />
            </div>
          </section>

          {/* Calendar & Sync */}
          <section id="section-calendar" className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 sm:p-6 flex flex-col gap-4 scroll-mt-24">
            <div className="flex flex-col pb-1">
              <h2 className="text-headline-lg text-on-surface tracking-tight">Calendar Integrations & Conflict Engine</h2>
              <p className="text-body-sm text-on-surface-variant">Synchronize focus blocks directly with your Google calendar feed.</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-surface-container-low/60 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shadow-sm">
                  <Icon name="event_available" className="text-[24px]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-headline-md font-semibold text-on-surface break-all">{session?.user?.email ?? "Not signed in"}</span>
                    <span className="font-mono text-code-badge bg-primary-fixed text-on-primary-fixed px-1.5 py-0.5 rounded font-medium">GOOGLE CALENDAR</span>
                  </div>
                  <span className="text-body-sm text-on-surface-variant">Last synchronized: {syncLabel}</span>
                </div>
              </div>
              <Link href="/settings/integrations/google-calendar" className="h-8 px-4 bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container rounded text-body-sm font-medium shadow-sm transition-colors self-start sm:self-auto inline-flex items-center">
                Manage Connection
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-surface-container-low/30 gap-3">
              <div className="flex flex-col">
                <span className="text-headline-md text-on-surface font-semibold">Default calendar stream</span>
                <span className="text-body-sm text-on-surface-variant">Tempo reads availability from your primary calendar.</span>
              </div>
              <span className="text-body-sm text-on-surface bg-surface-container-lowest border border-outline-variant rounded-lg px-3 h-8 inline-flex items-center shadow-sm">
                Primary Calendar (Work & Deep Work)
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-surface-container-low transition-colors">
                <div className="flex flex-col pr-4 min-w-0">
                  <span className="text-body-md font-semibold text-on-surface">Auto-Shift focus blocks on conflict</span>
                  <span className="text-body-sm text-on-surface-variant">When meetings overlap, offer one-tap deferral to adjacent open gaps. Otherwise flag for review.</span>
                </div>
                <Toggle
                  on={prefs.collisionMode === "auto"}
                  onClick={() => prefs.set({ collisionMode: prefs.collisionMode === "auto" ? "flag" : "auto" })}
                  label="Auto-Shift focus blocks on conflict"
                />
              </div>
            </div>
          </section>

          {/* Data & Privacy */}
          <section id="section-privacy" className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 sm:p-6 flex flex-col gap-4 scroll-mt-24">
            <div className="flex flex-col pb-1">
              <h2 className="text-headline-lg text-on-surface tracking-tight">Data Sovereignty & Privacy</h2>
              <p className="text-body-sm text-on-surface-variant">Export raw telemetry, download offline session archives, or clear local browser cache storage.</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-surface-container-low/50 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shadow-sm flex-shrink-0">
                  <Icon name="cloud_sync" className="text-[24px]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-headline-md font-semibold text-on-surface">Cloud Backup</span>
                  <span className="text-body-sm text-on-surface-variant">
                    {authStatus !== "authenticated"
                      ? "Sign in to back up tasks and history across devices."
                      : syncing
                        ? "Syncing…"
                        : syncError
                          ? `Last sync failed — ${syncError}`
                          : lastSyncedAt
                            ? `Last synced ${(() => {
                              const s = Math.max(0, Math.floor((Date.now() - lastSyncedAt) / 1000));
                              if (s < 60) return "just now";
                              if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                              return `${Math.floor(s / 3600)}h ago`;
                            })()} · tasks and history converge across devices`
                            : "Never synced on this device yet."}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void syncNow(authStatus === "authenticated")}
                disabled={authStatus !== "authenticated" || syncing}
                className="px-4 h-8 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-body-sm font-medium shadow-sm transition-colors self-start sm:self-auto disabled:opacity-50 flex-shrink-0"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col justify-between p-4 rounded-lg bg-surface-container-low/50 gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-primary text-headline-md font-semibold">
                    <Icon name="download" className="text-[20px]" />
                    <span>Export Activity Data</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant">
                    Download all Pomodoro sessions, timeline logs, focus adherence records, and sprint notes.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={exportJSON} className="px-3 h-8 bg-surface-container hover:bg-surface-container-high text-on-surface rounded font-mono text-code-badge font-semibold transition-colors flex items-center gap-1">
                    <span>JSON Archive</span>
                  </button>
                  <button type="button" onClick={exportCSV} className="px-3 h-8 bg-surface-container hover:bg-surface-container-high text-on-surface rounded font-mono text-code-badge font-semibold transition-colors flex items-center gap-1">
                    <span>CSV Metrics</span>
                  </button>
                </div>
              </div>
              <div className="flex flex-col justify-between p-4 rounded-lg bg-error/10 gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-error text-headline-md font-semibold">
                    <Icon name="delete_forever" className="text-[20px]" />
                    <span>Danger: Reset Local Cache</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant">
                    Clear cached session scratchpads, uncommitted drafts, and indexed local telemetry. Server records are preserved.
                  </p>
                </div>
                <button type="button" onClick={clearLocal} className="px-4 h-8 bg-error hover:brightness-110 text-surface rounded text-body-sm font-semibold transition-colors self-start shadow-sm">
                  Clear Local Index
                </button>
              </div>
            </div>
          </section>

          {/* Shortcuts */}
          <section id="section-shortcuts" className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 sm:p-6 flex flex-col gap-4 scroll-mt-24">
            <div className="flex items-center justify-between pb-1">
              <div className="flex flex-col">
                <h2 className="text-headline-lg text-on-surface tracking-tight">System Hotkeys & Keyboard Command</h2>
                <p className="text-body-sm text-on-surface-variant">Operate Tempo without lifting your hands from the keyboard row.</p>
              </div>
              <span className="text-label-xs text-on-surface-variant uppercase tracking-wider font-semibold hidden sm:inline">6 Global Hotkeys</span>
            </div>
            <div className="flex flex-col divide-y divide-surface-container">
              {(
                [
                  ["Start / Pause focus session", ["Space"], "Focus view · Dashboard (timer live)"],
                  ["Exit focus mode / Dismiss modal", ["Esc"], "Overlays · Focus · Break"],
                  ["Resume paused session", ["R"], "Focus view · Dashboard (paused)"],
                  ["Quick menu", ["⌘", "K"], "Everywhere → Tasks"],
                  ["Enter Focus Mode directly", ["F"], "Dashboard · Task details"],
                  ["Trigger calendar sync", ["S"], "Calendar page"],
                ] as Array<[string, string[], string]>
              ).map(([label, keys, scope]) => (
                <div key={label} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex flex-col">
                    <span className="text-body-md font-semibold text-on-surface">{label}</span>
                    <span className="text-label-xs text-secondary">{scope}</span>
                  </div>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {keys.map((k, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-on-surface-variant text-[11px]">+</span>}
                        <kbd className="font-mono text-code-badge bg-surface-container-low px-2 py-1 rounded shadow-sm text-on-surface font-semibold tracking-wide">{k}</kbd>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
