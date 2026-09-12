"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePomodoroStore, resolveBreaks } from "@/stores/pomodoro-store";
import { useTaskStore, selectTaskById, getFocusMode, getSessionLabel, getTaskFocusedMs } from "@/stores/task-store";
import { useNow } from "@/hooks/useNow";
import { useFinishSession } from "@/hooks/useFinishSession";
import {
  getElapsedFocusMs,
  getPausedMs,
  getRemainingMs,
  isExpired,
} from "@/lib/pomodoro-machine";
import { calculatePomodoroPlan, nextSliceMinutes, todayKey } from "@/lib/task-planning";
import { isAmbientPlaying, toggleAmbient } from "@/lib/ambient";
import { formatClock } from "@/lib/utils";
import { formatElapsedHMS } from "@/components/pomodoro/FocusTimer";
import Icon from "@/components/ui/Icon";
import DurationPicker, { QUICK_DURATIONS } from "@/components/dashboard/DurationPicker";
import QuickCadenceFields from "@/components/dashboard/QuickCadenceFields";
import QuickCreditPicker, { useCreditChoice } from "@/components/dashboard/QuickCreditPicker";
import { VideoToggleButton, VideoPill, AmbientVideo, type VideoMode } from "@/components/ambient/AmbientVideo";
import { MusicToggleButton, MusicPill } from "@/components/ambient/AmbientMusic";
import { TimerAnalog, TimerCircular, TimerFlip } from "@/components/pomodoro/FocusTimer";
import { usePrefsStore } from "@/stores/prefs-store";
import { useAmbientStore } from "@/stores/ambient-store";
import { findVideo } from "@/lib/focus-library";
import { cn } from "@/lib/utils";

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}

function fmtHM(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[10px] px-1 bg-surface-container-high text-on-surface-variant rounded border border-outline-variant">
      {children}
    </kbd>
  );
}

export default function FocusView() {
  const router = useRouter();
  const session = usePomodoroStore((s) => s.session);
  const config = usePomodoroStore((s) => s.config);
  const activeTaskId = usePomodoroStore((s) => s.activeTaskId);
  const activeTaskTitle = usePomodoroStore((s) => s.activeTaskTitle);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const extend = usePomodoroStore((s) => s.extend);
  const startForTask = usePomodoroStore((s) => s.startForTask);
  const startQuick = usePomodoroStore((s) => s.startQuick);
  const focusMode = usePomodoroStore((s) => s.focusMode);
  const sessionName = usePomodoroStore((s) => s.sessionName);
  const setSessionName = usePomodoroStore((s) => s.setSessionName);
  const tasks = useTaskStore((s) => s.tasks);
  const { handleComplete, handleCancel } = useFinishSession();

  const [mounted, setMounted] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [capture, setCapture] = useState("");
  const [parked, setParked] = useState(0);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickMinutes, setQuickMinutes] = useState(25);
  const [quickShortMin, setQuickShortMin] = useState(10);
  const [quickLongMin, setQuickLongMin] = useState(30);
  const [quickInterval, setQuickInterval] = useState(4);
  const quickTasks = useTaskStore((s) => s.tasks);
  const quickCandidates = useMemo(() => {
    const open = quickTasks.filter(
      (t) => t.status !== "COMPLETED" && t.status !== "CANCELLED"
    );
    const todayOpen = open.filter((t) => t.date === todayKey());
    return todayOpen.length > 0 ? todayOpen : open;
  }, [quickTasks]);
  const [quickCredit, setQuickCredit] = useCreditChoice(quickCandidates);
  const quickLabel = usePomodoroStore((s) => s.quickLabel);
  const [videoMode, setVideoMode] = useState<VideoMode>("background");
  const [chromeVisible, setChromeVisible] = useState(true);
  const timerStyle = usePrefsStore((s) => s.timerStyle);
  const setPrefs = usePrefsStore((s) => s.set);
  const timerFaded = usePrefsStore((s) => s.timerFaded);
  const timerHidden = usePrefsStore((s) => s.timerHidden);
  const ambientVideoOn = useAmbientStore((s) => s.videoEnabled);
  const ambientVideo = findVideo(useAmbientStore((s) => s.videoId));
  const prevStatus = useRef(session.status);
  useEffect(() => setMounted(true), []);
  // Seed the allocation-free quick form from workspace defaults (once).
  useEffect(() => {
    const cfg = usePomodoroStore.getState().config;
    setQuickMinutes(() => {
      const d = Math.round(cfg.focusMs / 60000);
      return QUICK_DURATIONS.includes(d) ? d : 25;
    });
    setQuickShortMin(Math.round(cfg.shortBreakMs / 60000));
    setQuickLongMin(Math.round(cfg.longBreakMs / 60000));
    setQuickInterval(cfg.longBreakInterval);
    const t = usePomodoroStore.getState().activeTaskTitle;
    if (t) setQuickTitle(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quickBreaks = {
    shortBreakMs: quickShortMin * 60000,
    longBreakMs: quickLongMin * 60000,
    longBreakInterval: quickInterval,
  };

  const ticking = session.status === "RUNNING" || session.status === "PAUSED";
  const paused = session.status === "PAUSED";
  const now = useNow(ticking);

  // Immersive calm state: video fills the screen and only the timer stays.
  // Engages while a session ticks — never on standby, so Start is reachable.
  const immersive = !!ambientVideoOn && !!ambientVideo && videoMode === "background" && ticking;
  const chromeHidden = immersive && !chromeVisible;
  const chromeClass = `transition-opacity duration-500 ${chromeHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`;

  // Any activity reveals chrome; 5s of stillness returns to minimal.
  // Mouse, touch, wheel, keys, and focus all count — interacting with a
  // control therefore keeps it visible. Timer + shortcuts keep working hidden.
  useEffect(() => {
    if (!immersive) {
      setChromeVisible(true);
      return;
    }
    setChromeVisible(false);
    let t: ReturnType<typeof setTimeout> | null = null;
    const poke = () => {
      setChromeVisible(true);
      if (t) clearTimeout(t);
      t = setTimeout(() => setChromeVisible(false), 5000);
    };
    const events = ["mousemove", "pointerdown", "touchstart", "wheel", "keydown", "focusin"];
    events.forEach((e) => window.addEventListener(e, poke));
    return () => {
      if (t) clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, poke));
    };
  }, [immersive]);

  useEffect(() => {
    if (session.status === "RUNNING" && isExpired(session, Date.now())) handleComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, now]);

  // A finished focus block lands on the Session Complete screen.
  useEffect(() => {
    if (
      prevStatus.current !== "COMPLETED" &&
      session.status === "COMPLETED" &&
      session.phase === "FOCUS"
    ) {
      router.push("/complete");
    }
    prevStatus.current = session.status;
  }, [session, router]);

  const activeTask = selectTaskById(tasks, activeTaskId);
  const breakOverride = usePomodoroStore((s) => s.breakOverride);
  const activeMode = activeTask ? getFocusMode(activeTask) : focusMode;
  const isInfinite = activeMode === "infinite" || session.isInfinite === true || focusMode === "infinite";
  const displayName = activeTask
    ? (isInfinite ? getSessionLabel(activeTask, activeTask.title) : activeTask.title)
    : (sessionName?.trim() || activeTaskTitle || "Deep Work Session");
  const title = displayName;

  const planLen = useMemo(() => {
    const t = activeTask;
    if (!t || getFocusMode(t) === "infinite") return Math.max(session.completedFocusCount + 1, 1);
    try {
      return calculatePomodoroPlan(t.allocatedMinutes, t.focusMinutes).length;
    } catch {
      return Math.max(session.completedFocusCount + 1, 1);
    }
  }, [activeTask, session.completedFocusCount]);
  const pomoIdx = isInfinite
    ? session.completedFocusCount + 1
    : Math.min((activeTask?.completedPomodoros ?? session.completedFocusCount) + 1, Math.max(planLen, 1));
  // A task run counts its own current slice — never the workspace default.
  // Infinite tasks are open-ended (no slice).
  const sliceMin = activeTask
    ? getFocusMode(activeTask) === "infinite"
      ? 0
      : nextSliceMinutes(activeTask.allocatedMinutes, activeTask.focusMinutes, activeTask.completedPomodoros)
    : Math.max(1, Math.round(session.plannedMs / 60000));

  const noteKey = `tempo-scratch-${activeTaskId ?? "general"}`;
  const countKey = `tempo-scratch-count-${activeTaskId ?? "general"}`;
  useEffect(() => {
    try {
      setParked(Number(window.localStorage.getItem(countKey)) || 0);
    } catch {
      setParked(0);
    }
  }, [countKey]);

  const parkNote = (text: string) => {
    const t = text.trim();
    if (!t) return;
    try {
      const prev = window.localStorage.getItem(noteKey) ?? "";
      window.localStorage.setItem(noteKey, prev ? `${prev}\n- ${t}` : `- ${t}`);
      const n = parked + 1;
      window.localStorage.setItem(countKey, String(n));
      setParked(n);
    } catch {
      // Optional — ignore storage failures.
    }
    setCapture("");
  };

  const doSound = () => setSoundOn(toggleAmbient());
  const exit = () => router.push("/");

  const doResetInfinite = () => {
    setConfirmingReset(false);
    // Archive a live run to History (CANCELLED), zero the infinite task's
    // accumulated progress, and return the timer to IDLE 00:00:00.
    // History is kept — only the visible timer + task totals restart.
    const st = usePomodoroStore.getState().session.status;
    if (st === "RUNNING" || st === "PAUSED") {
      try {
        handleCancel();
      } catch {
        // Never block the reset.
      }
    }
    try {
      const taskNow = selectTaskById(
        useTaskStore.getState().tasks,
        usePomodoroStore.getState().activeTaskId
      );
      if (taskNow && getFocusMode(taskNow) === "infinite") {
        useTaskStore.getState().resetTaskProgress(taskNow.id);
      }
    } catch {
      // Best-effort — live timer reset below still runs.
    }
    usePomodoroStore.getState().reset();
  };

  const startLinkedTask = () => {
    const st = usePomodoroStore.getState();
    const linked = st.activeTaskId
      ? selectTaskById(useTaskStore.getState().tasks, st.activeTaskId)
      : null;
    if (linked) {
      if (getFocusMode(linked) === "infinite") {
        st.startForTask(linked.id, linked.title, undefined, {
          focusMode: "infinite",
          sessionName: linked.sessionName ?? null,
          completedFocusCount: linked.completedFocusCount ?? linked.completedPomodoros ?? 0,
        });
      } else {
        st.startForTask(linked.id, linked.title, nextSliceMinutes(linked.allocatedMinutes, linked.focusMinutes, linked.completedPomodoros) * 60000);
      }
    } else {
      st.startQuick(
        quickTitle || undefined,
        quickMinutes * 60000,
        {
          shortBreakMs: quickShortMin * 60000,
          longBreakMs: quickLongMin * 60000,
          longBreakInterval: quickInterval,
        },
        quickCredit
      );
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // never steal browser/system shortcuts
      if (tag === "BUTTON" && e.code === "Space") return; // let focused buttons activate normally
      if (e.code === "Space" && !inField) {
        e.preventDefault();
        if (e.repeat) return;
        if (session.status === "RUNNING") pause();
        else if (session.status === "PAUSED") resume();
        else if (session.status === "IDLE") {
          startLinkedTask();
        }
      } else if (e.code === "Escape") {
        // Fullscreen video captures Esc first so Focus Mode stays put.
        if (videoMode === "fullscreen") setVideoMode("background");
        else if (drawerOpen) setDrawerOpen(false);
        else exit();
      } else if ((e.code === "KeyL") && !inField) {
        e.preventDefault();
        if (ticking) pause();
      } else if ((e.code === "KeyM") && !inField) {
        e.preventDefault();
        doSound();
      } else if ((e.code === "KeyN") && !inField) {
        e.preventDefault();
        setDrawerOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status, ticking, drawerOpen, pause, resume, startQuick, quickTitle, quickMinutes, quickShortMin, quickLongMin, quickInterval, quickCredit, videoMode, isInfinite, activeTaskId]);

  useEffect(() => {
    document.title = ticking
      ? isInfinite
        ? `${formatElapsedHMS(getElapsedFocusMs(session, Date.now()))} — Tempo`
        : `${formatClock(Math.ceil(getRemainingMs(session, Date.now()) / 1000))} — Tempo`
      : "Tempo — Focus Console";
    return () => {
      document.title = "Tempo — Focus Console";
    };
  }, [ticking, session, now, isInfinite]);

  useEffect(() => () => {
    // Leave ambient sound running only while the view lives.
    if (isAmbientPlaying()) toggleAmbient();
  }, []);

  if (!mounted) return null;

  const remainingMs = isInfinite
    ? Number.POSITIVE_INFINITY
    : session.status === "IDLE" && activeTask
      ? sliceMin * 60000
      : getRemainingMs(session, now);
  const elapsedMs = getElapsedFocusMs(session, now);
  // Total elapsed for infinite includes previously preserved runs.
  const totalElapsedMs = isInfinite && activeTask
    ? getTaskFocusedMs(activeTask) + elapsedMs
    : elapsedMs;
  const pausedMs = getPausedMs(session, now);
  const remainingSec = Number.isFinite(remainingMs) ? Math.ceil(remainingMs / 1000) : 0;
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const hms = formatElapsedHMS(totalElapsedMs);
  const pct = isInfinite ? 0 : session.plannedMs > 0 ? Math.min(100, (elapsedMs / session.plannedMs) * 100) : 0;
  const effBreaks = resolveBreaks(config, breakOverride);
  const breakMin = session.phase === "FOCUS" ? Math.round(effBreaks.shortBreakMs / 60000) : 0;
  const breakAt = Number.isFinite(remainingMs) ? fmtHM(now + remainingMs + 60000) : "—";
  const startedLabel = session.startedAt ? fmtClock(session.startedAt) : "—";

  const startPrimary = () => {
    if (activeTask) {
      if (getFocusMode(activeTask) === "infinite") {
        startForTask(activeTask.id, activeTask.title, undefined, {
          focusMode: "infinite",
          sessionName: activeTask.sessionName ?? null,
          completedFocusCount: activeTask.completedFocusCount ?? activeTask.completedPomodoros ?? 0,
        });
      } else {
        startForTask(activeTask.id, activeTask.title, sliceMin * 60000);
      }
    }
    else startQuick(quickTitle || undefined, quickMinutes * 60000, quickBreaks, quickCredit);
  };
  const showQuickForm = session.status === "IDLE" && !activeTask;

  return (
    <div
      className={`fixed inset-x-0 top-0 h-screen z-50 flex flex-col justify-between bg-surface text-on-surface select-none overflow-hidden overflow-y-auto ${chromeHidden ? "cursor-none" : ""}`}
      style={{ height: "100dvh" }}
    >
      {/* Ambient backdrop glow — barely-there warm green/amber depth */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-primary/[0.07] via-tertiary-fixed/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-[20%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-t from-accent-amber/[0.05] to-transparent rounded-full blur-3xl" />
        {/* Subtle green aura behind the timer */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle 260px at 50% 50%, rgba(127,176,105,0.09) 0%, transparent 70%)" }} />
      </div>
      {/* Ambient layers — independent of the Pomodoro timer (music plays globally from the root layout) */}
      <AmbientVideo mode={videoMode} setMode={setVideoMode} immersive={immersive} />
      {immersive && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 360px 360px at 50% 54%, rgba(0,0,0,0.34) 0%, transparent 70%)" }}
        />
      )}

      {/* Immersion header */}
      <header className={`relative z-10 w-full px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between gap-3 flex-wrap ${chromeClass}`}>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant shadow-sm flex items-center justify-center overflow-hidden">
              <svg className="w-4 h-4 text-on-surface" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="7" x2="12" y2="12" />
                <line x1="12" y1="12" x2="15" y2="15" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-headline-md tracking-tight text-on-surface">Tempo</span>
              <span className="font-mono text-code-badge text-on-surface-variant font-medium px-1.5 py-px bg-surface-container rounded">FOCUS</span>
            </div>
          </div>
          <div className="h-3 w-px bg-outline-variant/50 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", ticking && !paused ? "bg-primary animate-pulse" : "bg-secondary")} />
            <span className="text-label-xs uppercase tracking-widest text-on-surface-variant font-medium">
              {paused ? "Paused" : "Flow State Active"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant shadow-sm px-3 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-label-xs text-on-surface font-medium">Deep Work</span>
            <span className="text-label-xs text-on-surface-variant">•</span>
            <span className="font-mono text-code-badge text-on-surface-variant font-medium">
              {isInfinite ? "Infinite Focus" : `Session #${pomoIdx} of ${planLen}`}
            </span>
          </div>
          <VideoToggleButton onModeChange={setVideoMode} />
          <MusicToggleButton />
          {immersive && (
            <button
              type="button"
              onClick={() => setPrefs({ timerFaded: !timerFaded })}
              title={timerFaded ? "Unfade timer" : "Fade timer so the video shows through"}
              className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant shadow-sm hover:bg-surface-container-low text-on-surface px-3 py-1 rounded-lg transition-colors"
            >
              <Icon name="opacity" className={cn("text-[16px]", timerFaded ? "text-primary" : "text-on-surface-variant")} />
              <span className="text-body-sm font-medium hidden sm:inline">Fade</span>
              {timerFaded && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          )}
          {(immersive || timerHidden) && (
            <button
              type="button"
              onClick={() => setPrefs({ timerHidden: !timerHidden })}
              title={timerHidden ? "Show timer" : "Hide timer (session keeps running)"}
              className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant shadow-sm hover:bg-surface-container-low text-on-surface px-3 py-1 rounded-lg transition-colors"
            >
              <Icon
                name={timerHidden ? "visibility" : "visibility_off"}
                className={cn("text-[16px]", timerHidden ? "text-primary" : "text-on-surface-variant")}
              />
              <span className="text-body-sm font-medium hidden sm:inline">{timerHidden ? "Show" : "Hide"}</span>
              {timerHidden && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          )}
          <button
            type="button"
            onClick={doSound}
            title="Ambient sound (M)"
            className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant shadow-sm hover:bg-surface-container-low text-on-surface px-3 py-1 rounded-lg transition-colors"
          >
            <Icon name={soundOn ? "graphic_eq" : "volume_off"} className={cn("text-[16px]", soundOn ? "text-primary" : "text-on-surface-variant")} />
            <span className="text-body-sm font-medium hidden sm:inline">{soundOn ? "Brown Noise" : "Muted"}</span>
            <Kbd>M</Kbd>
          </button>
          <div className="hidden sm:flex items-center bg-surface-container-low p-0.5 rounded-lg border border-outline-variant shadow-sm">
            <button
              type="button"
              onClick={resume}
              className={cn(
                "px-1.5 py-px rounded-md text-label-xs transition-all",
                !paused && ticking ? "font-semibold bg-primary-fixed text-on-primary-fixed shadow-sm" : "font-medium text-on-surface-variant hover:text-on-surface"
              )}
            >
              Active
            </button>
            <button
              type="button"
              onClick={pause}
              className={cn(
                "px-1.5 py-px rounded-md text-label-xs transition-all",
                paused ? "font-semibold bg-accent-amber-container text-on-accent-amber shadow-sm" : "font-medium text-on-surface-variant hover:text-on-surface"
              )}
            >
              Paused
            </button>
          </div>
          <div className="h-3 w-px bg-outline-variant/50 hidden sm:block" />
          <button
            type="button"
            onClick={exit}
            title="Exit Focus Mode"
            className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-high shadow-sm px-3 py-1 rounded-lg text-on-surface transition-all"
          >
            <span className="text-body-sm">Exit</span>
            <Kbd>Esc</Kbd>
          </button>
        </div>
      </header>

      {/* Center immersion display */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 max-w-4xl mx-auto w-full">
        <div className={`flex flex-col items-center text-center gap-1 mb-4 ${chromeClass}`}>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-surface-container-lowest border border-outline-variant shadow-sm">
            <span className={cn("w-1.5 h-1.5 rounded-full", paused ? "bg-accent-amber" : "bg-primary")} />
            <span className={cn("text-label-xs tracking-widest uppercase font-semibold", paused ? "text-on-accent-amber" : "text-on-primary-fixed")}>
              {isInfinite
                ? paused
                  ? "Focus Paused"
                  : ticking
                    ? "Infinite Focus"
                    : "Infinite Focus"
                : paused
                  ? "Session Paused"
                  : session.phase === "FOCUS"
                    ? "Focus Session"
                    : session.phase.replace("_", " ")}
            </span>
          </div>
          <h1 className="text-headline-lg sm:text-[32px] sm:leading-[38px] text-on-surface tracking-tight font-semibold mt-0.5">
            {title}
          </h1>
          {isInfinite && activeTask?.sessionName && (
            <span className="text-body-sm text-on-surface-variant">Task: {activeTask.title}</span>
          )}
          {quickLabel !== null && activeTaskId && ticking && !isInfinite && (
            <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-mono text-code-badge font-semibold">
              <span>Quick {Math.max(1, Math.round(session.plannedMs / 60000))}m → counts in {title}</span>
            </span>
          )}
          <p className="text-body-sm text-on-surface-variant flex items-center gap-1.5">
            {isInfinite ? (
              <>
                <span>Open-ended</span>
                <span>•</span>
                <span>Elapsed {hms} Focused</span>
              </>
            ) : (
              <>
                <span>Pomodoro {pomoIdx} of {planLen}</span>
                <span>•</span>
                <span>Deep Work Block ({sliceMin}m block)</span>
              </>
            )}
          </p>
          {isInfinite && ticking && (
            <div className="flex items-center gap-2 mt-1">
              <input
                value={sessionName ?? activeTask?.sessionName ?? ""}
                onChange={(e) => setSessionName(e.target.value || null)}
                placeholder="Name this session…"
                aria-label="Infinite session name"
                className="h-8 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 text-body-sm text-center focus:outline-none focus:border-primary w-64"
              />
            </div>
          )}
          {isInfinite && paused && (
            <div className="mt-2 px-4 py-1.5 rounded-xl bg-accent-amber-container/60 border border-accent-amber/25">
              <span className="text-label-xs text-on-accent-amber font-medium">
                Paused — focus time is frozen. Resume whenever you&apos;re ready.
              </span>
            </div>
          )}
          {showQuickForm && (
            <div className="flex flex-col items-center gap-2 mt-2 w-full max-w-sm">
              <input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Quick session label (optional)"
                className="w-full h-10 sm:h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 text-base sm:text-body-sm text-center focus:outline-none focus:border-primary"
              />
              <DurationPicker compact minutes={quickMinutes} onChange={setQuickMinutes} />
              <div className="w-full text-left">
                <QuickCreditPicker
                  tasks={quickCandidates}
                  value={quickCredit}
                  onChange={setQuickCredit}
                />
              </div>
              <div className="w-full">
                <QuickCadenceFields
                  shortBreakMin={quickShortMin}
                  longBreakMin={quickLongMin}
                  interval={quickInterval}
                  onShort={setQuickShortMin}
                  onLong={setQuickLongMin}
                  onInterval={setQuickInterval}
                />
              </div>
              <span className="text-label-xs text-on-surface-variant">
                {quickCredit
                  ? `Counts toward ${quickCredit.taskTitle} when finished`
                  : "Logs to History without allocation"}
              </span>
            </div>
          )}
        </div>

        {!timerHidden && (
          <div
            className={`relative w-[min(78vw,300px,62dvh)] h-[min(78vw,300px,62dvh)] sm:w-[min(400px,62dvh)] sm:h-[min(400px,62dvh)] flex items-center justify-center transition-opacity duration-500 ${timerFaded ? "opacity-30" : "opacity-100"}`}
          >
            {timerStyle === "flip" ? (
              <TimerFlip mm={mm} ss={ss} pct={pct} paused={paused} ticking={ticking} elapsedMs={totalElapsedMs} plannedMs={session.plannedMs} infinite={isInfinite} hms={hms} />
            ) : timerStyle === "analog" ? (
              <TimerAnalog mm={mm} ss={ss} pct={pct} paused={paused} ticking={ticking} elapsedMs={totalElapsedMs} plannedMs={session.plannedMs} infinite={isInfinite} hms={hms} />
            ) : (
              <TimerCircular mm={mm} ss={ss} pct={pct} paused={paused} ticking={ticking} elapsedMs={totalElapsedMs} plannedMs={session.plannedMs} infinite={isInfinite} hms={hms} />
            )}
          </div>
        )}

        <div className={`flex flex-col items-center gap-3 mt-5 w-full ${chromeClass}`}>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {session.status === "IDLE" && (
              <button type="button" onClick={startPrimary} className="h-10 px-6 rounded-xl bg-primary text-on-primary text-body-sm font-semibold hover:bg-primary-container active:scale-[0.98] transition-all flex items-center gap-2 shadow-md">
                <Icon name="play_arrow" className="text-[18px]" />
                <span>Start</span>
                <kbd className="font-mono text-[10px] px-1.5 py-0.5 bg-black/15 text-on-primary rounded ml-0.5">Space</kbd>
              </button>
            )}
            {session.status === "RUNNING" && (
              <button type="button" onClick={pause} className="h-10 px-6 rounded-xl bg-on-surface text-surface text-body-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 shadow-md">
                <Icon name="pause" className="text-[18px]" />
                <span>Pause</span>
                <kbd className="font-mono text-[10px] px-1.5 py-0.5 bg-black/15 text-surface rounded ml-0.5">Space</kbd>
              </button>
            )}
            {paused && (
              <button type="button" onClick={resume} className="h-10 px-6 rounded-xl bg-primary text-on-primary text-body-sm font-semibold hover:bg-primary-container active:scale-[0.98] transition-all flex items-center gap-2 shadow-md ring-2 ring-primary/25">
                <Icon name="play_arrow" className="text-[18px]" />
                <span>Resume</span>
                <kbd className="font-mono text-[10px] px-1.5 py-0.5 bg-black/15 text-on-primary rounded ml-0.5">Space</kbd>
              </button>
            )}
            {(session.status === "COMPLETED" || session.status === "CANCELLED") && (
              <button type="button" onClick={startPrimary} className="h-10 px-6 rounded-xl bg-on-surface text-surface text-body-sm font-medium hover:brightness-110 transition-all flex items-center gap-2 shadow-md">
                <Icon name="play_arrow" className="text-[18px]" />
                <span>Start next</span>
              </button>
            )}
            {ticking && (
              <button type="button" onClick={handleComplete} className="h-10 px-4 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-body-sm font-medium hover:bg-surface-container-high active:scale-[0.98] transition-all flex items-center gap-1.5 shadow-sm">
                <Icon name="stop" className="text-[18px] text-error" />
                <span>{isInfinite ? "End Session" : "End Block"}</span>
                <Kbd>⌘E</Kbd>
              </button>
            )}
            {isInfinite && activeTask && (ticking || totalElapsedMs > 0) && (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                title="Reset infinite timer to 00:00:00"
                className="h-10 px-4 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface-variant hover:text-error hover:border-error/30 text-body-sm font-medium active:scale-[0.98] transition-all flex items-center gap-1.5 shadow-sm"
              >
                <Icon name="restart_alt" className="text-[18px]" />
                <span>Reset timer</span>
              </button>
            )}
          </div>
          {isInfinite && confirmingReset && (
            <div className="w-full max-w-md p-4 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-lg flex flex-col gap-2 text-center">
              <span className="text-body-sm font-semibold text-on-surface">Reset infinite timer?</span>
              <span className="text-body-sm text-on-surface-variant">
                This zeroes the visible timer ({hms}) and clears this task&apos;s accumulated focus back to 00:00:00. Past sessions stay in History.
              </span>
              <div className="flex items-center justify-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="h-9 px-4 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-body-sm font-medium transition-colors"
                >
                  Keep time
                </button>
                <button
                  type="button"
                  onClick={doResetInfinite}
                  className="h-9 px-4 rounded-lg bg-error text-on-error hover:brightness-110 text-body-sm font-semibold transition-all"
                >
                  Reset to 00:00:00
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {!isInfinite && (
            <button type="button" title="Extend 5 minutes" disabled={!ticking} onClick={() => extend(5)} className="px-3 h-8 rounded-lg bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface text-body-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-40">
              <Icon name="more_time" className="text-[16px]" />
              <span>+5m extension</span>
            </button>
            )}
            <button type="button" title="Log quick interruption (L)" disabled={!ticking} onClick={pause} className="px-3 h-8 rounded-lg bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface text-body-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-40">
              <Icon name="notifications_paused" className="text-[16px]" />
              <span>Log Interruption</span>
              <Kbd>L</Kbd>
            </button>
            <button type="button" title="Scratchpad (N)" onClick={() => setDrawerOpen((v) => !v)} className="px-3 h-8 rounded-lg bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface text-body-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm">
              <Icon name="edit_note" className="text-[16px]" />
              <span>Scratchpad</span>
              <Kbd>N</Kbd>
            </button>
          </div>
          {/* Ambient controls — video and music stay fully independent */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <VideoPill mode={videoMode} setMode={setVideoMode} />
            <MusicPill />
          </div>
        </div>

        {drawerOpen && (
          <div className="w-full max-w-lg mt-3 p-3 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg">
            <div className="flex items-center justify-between pb-1.5 mb-1.5">
              <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">Brain Dump / Parking Lot</span>
              <button type="button" onClick={() => setDrawerOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <Icon name="close" className="text-[16px]" />
              </button>
            </div>
            <textarea
              autoFocus
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  parkNote(capture);
                }
              }}
              placeholder="Capture stray thought or task for later... (press Enter to park)"
              rows={2}
              className="w-full bg-surface-container-low rounded-lg p-2.5 text-base sm:text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex items-center justify-between mt-0.5 text-[11px] text-on-surface-variant">
              <span>Stays private to this session</span>
              <span>{parked} captured</span>
            </div>
          </div>
        )}
      </main>

      {/* Telemetry strip + hotkey legend */}
      <footer className={`relative z-10 w-full px-4 sm:px-8 py-3 sm:py-4 flex flex-col items-center gap-2 ${chromeClass}`}>
        <div className="w-full max-w-3xl hidden sm:flex flex-wrap items-center justify-between py-1.5 px-4 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm gap-2">
          <div className="flex items-center gap-1.5">
            <Icon name="schedule" className="text-[15px] text-on-surface-variant" />
            <span className="text-label-xs text-on-surface-variant">Started</span>
            <span className="font-mono text-[12px] font-medium text-on-surface">{startedLabel}</span>
          </div>
          <div className="h-3 w-px bg-surface-variant" />
          <div className="flex items-center gap-1.5">
            <Icon name="timelapse" className="text-[15px] text-primary" />
            <span className="text-label-xs text-on-surface-variant">Focused</span>
            <span className="font-mono text-[12px] font-medium text-on-surface">
              {isInfinite ? hms : `${Math.round(elapsedMs / 60000)}m`}
            </span>
          </div>
          <div className="h-3 w-px bg-surface-variant" />
          <div className="flex items-center gap-1.5">
            <Icon name="pause_circle" className="text-[15px] text-on-surface-variant" />
            <span className="text-label-xs text-on-surface-variant">Paused</span>
            <span className="font-mono text-[12px] font-medium text-on-surface">
              {`${Math.round(pausedMs / 60000)}m`}
            </span>
          </div>
          <div className="h-3 w-px bg-surface-variant" />
          <div className="flex items-center gap-1.5">
            <Icon name="call_missed" className="text-[15px] text-on-surface-variant" />
            <span className="text-label-xs text-on-surface-variant">Interruptions</span>
            <span className="font-mono text-[12px] font-medium text-on-surface">{session.pauseCount}</span>
          </div>
          <div className="h-3 w-px bg-surface-variant" />
          <div className="flex items-center gap-1.5">
            <Icon name="free_breakfast" className="text-[15px] text-tertiary" />
            <span className="text-label-xs text-on-surface-variant">Next:</span>
            <span className="text-[12px] font-medium text-on-surface">
              {isInfinite
                ? paused
                  ? "resume focus"
                  : "pause anytime"
                : session.phase === "FOCUS"
                  ? `${breakMin}m break (at ${breakAt})`
                  : "focus block"}
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center justify-center gap-4 text-on-surface-variant text-[11px] tracking-wide pt-0.5">
          <span className="flex items-center gap-1"><Kbd>Space</Kbd> Pause/Resume</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> Exit Focus</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Kbd>L</Kbd> Interruption</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Kbd>M</Kbd> Ambient Sound</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Kbd>N</Kbd> Scratchpad</span>
        </div>
      </footer>
    </div>
  );
}
