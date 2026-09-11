"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePomodoroStore, resolveBreaks } from "@/stores/pomodoro-store";
import { usePrefsStore } from "@/stores/prefs-store";
import { useTaskStore, selectTaskById } from "@/stores/task-store";
import { useSessionHistoryStore } from "@/stores/session-history-store";
import { useNow } from "@/hooks/useNow";
import { useFinishSession } from "@/hooks/useFinishSession";
import { getElapsedFocusMs, getRemainingMs, isExpired } from "@/lib/pomodoro-machine";
import { calculatePomodoroPlan, countPlannedPomodoros, todayKey } from "@/lib/task-planning";
import { isAmbientPlaying, toggleAmbient } from "@/lib/ambient";
import { formatClock, formatDurationMinutes } from "@/lib/utils";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

function Kbd({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <kbd className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded ml-1 border border-outline-variant", dark ? "text-on-surface bg-surface-container-high" : "text-on-surface-variant bg-surface-container-low")}>
      {children}
    </kbd>
  );
}

const R = 172;
const CIRC = 2 * Math.PI * R;

export default function BreakView() {
  const router = useRouter();
  const session = usePomodoroStore((s) => s.session);
  const config = usePomodoroStore((s) => s.config);
  const breakOverride = usePomodoroStore((s) => s.breakOverride);
  const breaks = resolveBreaks(config, breakOverride);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const start = usePomodoroStore((s) => s.start);
  const reset = usePomodoroStore((s) => s.reset);
  const startForTask = usePomodoroStore((s) => s.startForTask);
  const tasks = useTaskStore((s) => s.tasks);
  const autoStartFocus = usePrefsStore((s) => s.autoStartFocus);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const { handleComplete } = useFinishSession();

  const [mounted, setMounted] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => setMounted(true), []);

  const ticking = session.status === "RUNNING" || session.status === "PAUSED";
  const onBreak = session.phase === "SHORT_BREAK" || session.phase === "LONG_BREAK";
  const liveBreak = onBreak && ticking;
  const now = useNow(ticking);

  useEffect(() => {
    if (session.status === "RUNNING" && isExpired(session, Date.now())) handleComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, now]);

  useEffect(() => () => {
    if (isAmbientPlaying()) toggleAmbient();
  }, []);

  const isLong = session.phase === "LONG_BREAK";
  const activeTask = selectTaskById(tasks, activeTaskId);

  // Last completed focus block (session information card).
  const lastFocus = sessions.find((x) => x.phase === "FOCUS" && x.status === "COMPLETED") ?? null;

  // Next focus block.
  const todayTasks = tasks.filter((t) => t.date === todayKey());
  const nextTask = activeTask ?? todayTasks.find((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED") ?? null;
  const nextPlanLen = (() => {
    if (!nextTask) return 1;
    try {
      return calculatePomodoroPlan(nextTask.allocatedMinutes, nextTask.focusMinutes).length;
    } catch {
      return 1;
    }
  })();
  const nextIdx = Math.min((nextTask?.completedPomodoros ?? 0) + 1, Math.max(nextPlanLen, 1));

  // Daily target: completed focus blocks vs planned.
  const completedToday = sessions.filter((x) => x.phase === "FOCUS" && x.status === "COMPLETED").length;
  const plannedToday = todayTasks.reduce((s, t) => {
    try {
      return s + countPlannedPomodoros(t.allocatedMinutes, t.focusMinutes);
    } catch {
      return s;
    }
  }, 0);

  const remainingMs = getRemainingMs(session, now);
  const elapsedMs = getElapsedFocusMs(session, now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const pct = session.plannedMs > 0 ? Math.min(100, (elapsedMs / session.plannedMs) * 100) : 0;

  const switchBreak = (phase: "SHORT_BREAK" | "LONG_BREAK") => {
    reset();
    start(
      phase,
      phase === "SHORT_BREAK" ? breaks.shortBreakMs : breaks.longBreakMs
    );
  };

  const skipBreak = () => {
    if (liveBreak) handleComplete();
    // Auto-start preferences may have already advanced the timer — never double-start.
    const st = usePomodoroStore.getState().session.status;
    if (st === "COMPLETED" || st === "CANCELLED" || st === "IDLE") {
      if (nextTask) startForTask(nextTask.id, nextTask.title);
      else start("FOCUS");
    }
    router.push("/focus");
  };

  const endSession = () => {
    if (liveBreak) handleComplete();
    router.push("/");
  };

  const doSound = () => setSoundOn(toggleAmbient("rain"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (tag === "BUTTON" && e.code === "Space") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) skipBreak();
      } else if (e.code === "Escape") {
        router.push("/");
      } else if (e.code === "KeyM") {
        e.preventDefault();
        doSound();
      } else if (e.code === "Digit1") {
        switchBreak("SHORT_BREAK");
      } else if (e.code === "Digit2") {
        switchBreak("LONG_BREAK");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeTaskId, tasks]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 bg-surface text-on-surface flex flex-col justify-between overflow-hidden overflow-y-auto">
      {/* Restorative backdrop — barely-there warm amber depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[850px] h-[850px] bg-gradient-to-b from-tertiary-fixed/50 via-accent-amber-container/20 to-transparent rounded-full blur-3xl opacity-70" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[350px] bg-gradient-to-t from-primary-fixed/25 via-transparent to-transparent blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#22211e_1px,transparent_1px),linear-gradient(to_bottom,#22211e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,#000_70%,transparent_100%)] opacity-30" />
      </div>

      {/* Utility bar */}
      <header className="relative z-20 w-full px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between gap-3 flex-wrap border-b border-outline-variant bg-surface-container-lowest/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-center shadow-sm">
            <svg className="w-3.5 h-3.5 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-sm text-on-surface">Tempo</span>
            <span className="text-xs font-mono text-on-surface-variant">/</span>
            <span className="text-xs font-mono uppercase tracking-wider text-on-tertiary-fixed bg-tertiary-fixed border border-tertiary/20 px-2 py-0.5 rounded-md font-medium">Break Mode</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-on-surface-variant pl-3 border-l border-outline-variant">
            <span className={cn("w-1.5 h-1.5 rounded-full", liveBreak ? "bg-tertiary animate-pulse" : "bg-secondary-fixed-dim")} />
            <span>{liveBreak ? (isLong ? "Extended Recovery Window" : "Rest Cadence Active") : "Break Paused"}</span>
          </div>
        </div>

        <div className="hidden md:flex items-center bg-surface-container-low p-1 rounded-lg border border-outline-variant shadow-sm">
          {(["SHORT_BREAK", "LONG_BREAK"] as const).map((ph) => {
            const mins = Math.round((ph === "SHORT_BREAK" ? breaks.shortBreakMs : breaks.longBreakMs) / 60000);
            const label = ph === "SHORT_BREAK" ? `Short Break (${mins}m)` : `Long Break (${mins}m)`;
            const selected = liveBreak ? session.phase === ph : ph === "SHORT_BREAK";
            return (
              <button
                key={ph}
                type="button"
                onClick={() => switchBreak(ph)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all duration-150",
                  selected ? "bg-surface-container-highest text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={doSound}
            title="Ambient sound (M)"
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-container-low border border-outline-variant text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <Icon name={soundOn ? "graphic_eq" : "volume_off"} className="text-[14px] text-tertiary" />
            <span className="hidden sm:inline">{soundOn ? "Forest Rainfall" : "Muted"}</span>
            <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded border border-outline-variant">M</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1 px-2 py-1 rounded"
          >
            <span>Exit Focus</span>
            <span className="font-mono text-[10px] text-on-surface-variant bg-surface-container-high px-1 py-0.5 rounded border border-outline-variant">Esc</span>
          </button>
        </div>
      </header>

      {/* Dial */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-4 max-w-4xl mx-auto w-full">
        <div className="relative flex flex-col items-center justify-center w-full">
          <div className="absolute w-[300px] h-[300px] sm:w-[440px] sm:h-[440px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle 380px at 50% 50%, rgba(224,145,69,0.09) 0%, rgba(232,200,106,0.045) 50%, transparent 80%)" }} />
          <div className="absolute w-[280px] h-[280px] sm:w-[400px] sm:h-[400px] rounded-full border border-tertiary/25 animate-breathe pointer-events-none" />
          <div className="absolute w-[300px] h-[300px] sm:w-[430px] sm:h-[430px] rounded-full border border-accent-amber/15 animate-breathe [animation-delay:1.5s] pointer-events-none" />

          <div className="relative w-[min(78vw,300px)] h-[min(78vw,300px)] sm:w-[380px] sm:h-[380px] rounded-full bg-surface-container-lowest/95 backdrop-blur-xl border border-outline-variant shadow-sm flex flex-col items-center justify-center p-8">
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 380 380">
              <circle cx="190" cy="190" r={R} fill="none" stroke="#32302b" strokeWidth="2" strokeDasharray="2 6" className="opacity-60" />
              <circle
                cx="190" cy="190" r={R} fill="none" stroke="url(#breakGradient)" strokeWidth="4"
                strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)}
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="breakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e09145" />
                  <stop offset="100%" stopColor="#e8c86a" />
                </linearGradient>
              </defs>
            </svg>

            <div className="flex flex-col items-center text-center z-10 select-none">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                <span className="text-[11px] font-mono uppercase tracking-widest text-on-tertiary-fixed font-semibold">
                  {isLong ? "LONG BREAK" : "SHORT BREAK"}
                </span>
              </div>
              <div className="font-mono text-6xl sm:text-7xl font-light tracking-tight text-on-surface tabular-nums my-1">
                {formatClock(remainingSec)}
              </div>
              <div className="mt-1 space-y-1">
                <h1 className="text-xl font-semibold text-on-surface tracking-tight">
                  {isLong ? "Take a proper break." : "Step away."}
                </h1>
                <p className="text-xs text-on-surface-variant max-w-[240px] leading-relaxed font-normal">
                  {isLong ? "Deep cognitive reset before your next cycle." : "Your next focus session starts when you're ready."}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[11px] text-on-surface-variant bg-tertiary-fixed/50 border border-tertiary/20 px-2.5 py-1 rounded-full">
                <Icon name="light_mode" className="text-[12px] text-tertiary" />
                <span>{isLong ? "Take a walk • Disconnect from screens" : "Rest your eyes • Stand and hydrate"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 w-full max-w-sm z-20 flex-wrap">
          <button
            type="button"
            onClick={skipBreak}
            className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-container text-on-primary text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all duration-150 active:scale-[0.99] group"
          >
            <span>Skip Break</span>
            <Icon name="skip_next" className="text-[16px] text-on-primary/70 group-hover:text-on-primary transition-colors" />
            <Kbd dark>Space</Kbd>
          </button>
          <button
            type="button"
            onClick={endSession}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant text-on-surface text-sm font-medium rounded-xl transition-all duration-150 active:scale-[0.99] shadow-sm"
          >
            <Icon name="stop" className="text-[14px] text-on-surface-variant" />
            <span>End Session</span>
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl z-20">
          <div className="bg-surface-container-lowest/95 backdrop-blur-md rounded-2xl border border-outline-variant p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant font-mono">Session Information</span>
              </div>
              {lastFocus && (
                <span className="text-[11px] font-mono text-on-primary-fixed bg-primary-fixed px-2 py-0.5 rounded border border-primary/20 font-medium">Logged</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3">
              <div>
                <div className="text-[11px] text-on-surface-variant font-medium">Completed</div>
                <div className="text-base font-semibold text-on-surface font-mono tracking-tight mt-0.5">
                  {lastFocus ? `Pomodoro ${session.completedFocusCount}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-on-surface-variant font-medium">Focused</div>
                <div className="text-base font-semibold text-on-surface font-mono tracking-tight mt-0.5">
                  {lastFocus ? formatDurationMinutes(Math.round(lastFocus.focusedMs / 60000)) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-on-surface-variant font-medium">Interruptions</div>
                <div className="text-base font-semibold text-on-accent-amber font-mono tracking-tight mt-0.5">
                  {lastFocus ? lastFocus.interruptions : "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest/95 backdrop-blur-md rounded-2xl border border-outline-variant p-4 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary rounded-l" />
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant pl-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-tertiary-fixed font-mono">Next Up</span>
              <span className="text-[11px] font-mono text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded border border-outline-variant">
                Stage {nextIdx}/{Math.max(nextPlanLen, 1)}
              </span>
            </div>
            <div className="pt-2 pl-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-on-surface tracking-tight truncate">
                  {nextTask ? nextTask.title : "No upcoming block"}
                </div>
                <div className="text-xs text-on-surface-variant font-mono mt-0.5">
                  {nextTask ? `Pomodoro ${nextIdx} of ${Math.max(nextPlanLen, 1)} • ${nextTask.focusMinutes}m block` : "Plan a task to continue"}
                </div>
              </div>
              <button
                type="button"
                title="Begin next block"
                onClick={skipBreak}
                disabled={!nextTask}
                className="w-8 h-8 rounded-lg bg-tertiary-fixed border border-tertiary/20 flex items-center justify-center text-on-tertiary-fixed hover:brightness-125 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Icon name="play_arrow" className="text-[16px]" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer legend */}
      <footer className="relative z-20 w-full px-4 sm:px-8 py-4 border-t border-outline-variant bg-surface-container-lowest/70 backdrop-blur-sm flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant">Space</span>
            <span>Skip break & begin Pomodoro {nextIdx}</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="font-mono text-[10px] text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant">Esc</span>
            <span>Return to Dashboard</span>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="font-mono text-[10px] text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant">M</span>
            <span>Toggle ambient sound</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-on-surface-variant font-mono text-[11px]">
          <span>Auto-advance: <strong className="text-on-surface font-medium">{autoStartFocus ? "On" : "Off"}</strong> (deliberate start)</span>
          <span>•</span>
          <span>Daily target: <strong className="text-on-tertiary-fixed font-medium">{completedToday} of {plannedToday} blocks</strong></span>
        </div>
      </footer>
    </div>
  );
}
