"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import DurationPicker, { QUICK_DURATIONS } from "@/components/dashboard/DurationPicker";
import QuickCadenceFields from "@/components/dashboard/QuickCadenceFields";
import { usePomodoroStore } from "@/stores/pomodoro-store";

/**
 * Allocation-free entry point: start a pomodoro with just a label +
 * duration. No task is created, nothing is allocated — the session
 * still logs to History with taskId null.
 */
export default function QuickFocusCard() {
  const router = useRouter();
  const config = usePomodoroStore((s) => s.config);
  const session = usePomodoroStore((s) => s.session);
  const startQuick = usePomodoroStore((s) => s.startQuick);

  const defaultMin = Math.round(config.focusMs / 60000);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(
    QUICK_DURATIONS.includes(defaultMin) ? defaultMin : 25
  );
  const [shortMin, setShortMin] = useState(() =>
    Math.round(config.shortBreakMs / 60000)
  );
  const [longMin, setLongMin] = useState(() =>
    Math.round(config.longBreakMs / 60000)
  );
  const [interval, setInterval] = useState(config.longBreakInterval);

  const ticking =
    session.status === "RUNNING" || session.status === "PAUSED";

  const begin = () => {
    // startQuick safely preempts: a live run is archived to History as
    // CANCELLED before the new session starts, so replacing never loses data.
    startQuick(title || undefined, minutes * 60000, {
      shortBreakMs: shortMin * 60000,
      longBreakMs: longMin * 60000,
      longBreakInterval: interval,
    });
    setTitle("");
    router.push("/focus");
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="timer" className="text-[18px] text-primary" />
          <span className="text-headline-md text-on-surface font-semibold">
            Quick Focus
          </span>
        </div>
        <span className="font-mono text-code-badge text-on-primary-fixed bg-primary-fixed px-1.5 py-0.5 rounded font-semibold">
          No task needed
        </span>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        Just a pomodoro — pick a label and duration. Logs to History without
        allocating time.
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") begin();
        }}
        placeholder="Deep Work Session (optional)"
        className="h-8 rounded-lg border border-outline bg-surface-container-low px-2.5 text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
      />
      <DurationPicker minutes={minutes} onChange={setMinutes} />
      <QuickCadenceFields
        shortBreakMin={shortMin}
        longBreakMin={longMin}
        interval={interval}
        onShort={setShortMin}
        onLong={setLongMin}
        onInterval={setInterval}
      />
      {ticking && (
        <p className="text-label-xs text-on-surface-variant">
          A session is live — starting a new one logs the current run as cancelled.
        </p>
      )}
      <button
        type="button"
        onClick={begin}
        className="h-8 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container text-body-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
      >
        <Icon name={ticking ? "swap_horiz" : "play_arrow"} className="text-[16px]" />
        <span>
          {ticking ? `Replace & start ${minutes}m` : `Start ${minutes}m focus`}
        </span>
        {!ticking && (
          <kbd className="font-mono text-[10px] bg-black/15 px-1 rounded">
            Q
          </kbd>
        )}
      </button>
      {ticking && (
        <Link
          href="/focus"
          className="h-8 px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-body-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span>Session live — open focus instead</span>
        </Link>
      )}
    </div>
  );
}
