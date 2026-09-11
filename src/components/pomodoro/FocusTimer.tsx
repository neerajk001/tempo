"use client";

import { useEffect, useState } from "react";
import type { TimerStyle } from "@/stores/prefs-store";
import { cn } from "@/lib/utils";

export type { TimerStyle };

export interface TimerProps {
  mm: string;
  ss: string;
  /** 0..100 progress through the planned block */
  pct: number;
  paused: boolean;
  ticking: boolean;
  elapsedMs: number;
  plannedMs: number;
}

const R = 174;
const CIRC = 2 * Math.PI * R;

function TimerMeta({ elapsedMs, pct, paused }: Pick<TimerProps, "elapsedMs" | "pct" | "paused">) {
  return (
    <>
      <div className="mt-1 flex items-center gap-1.5 text-on-surface-variant font-mono text-code-badge">
        <span className="text-[11px] tabular-nums">
          {Math.floor(elapsedMs / 60000)}m {String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, "0")}s elapsed
        </span>
        <span>•</span>
        <span className="text-primary font-medium">{Math.round(pct)}% Completed</span>
      </div>
      {paused && (
        <div className="mt-2 px-3 py-0.5 rounded bg-accent-amber-container border border-accent-amber/20 text-on-accent-amber text-label-xs font-semibold uppercase tracking-wider">
          Countdown Suspended
        </div>
      )}
    </>
  );
}

/** Variant 1 — the existing circular progress timer (default). */
export function TimerCircular({ mm, ss, pct, paused, ticking, elapsedMs }: TimerProps) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" fill="none" viewBox="0 0 400 400">
        <circle className="stroke-surface-container-high" cx="200" cy="200" r={R} strokeLinecap="round" strokeWidth="5" />
        <circle className="stroke-surface-variant/70" cx="200" cy="200" r="162" strokeDasharray="1 11" strokeWidth="1.5" />
        <circle
          className={cn("transition-all duration-700 ease-out", paused ? "stroke-secondary" : "stroke-primary")}
          cx="200" cy="200" r={R}
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)}
          strokeLinecap="round" strokeWidth="6"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-text">
        <span className="font-mono text-code-badge uppercase tracking-widest text-on-surface-variant mb-0.5 font-medium">
          Time Remaining
        </span>
        <div className="flex items-baseline justify-center tracking-tight font-mono text-[68px] sm:text-[92px] leading-none text-on-surface font-medium tabular-nums my-0.5">
          <span>{mm}</span>
          <span className={cn("inline-block text-primary mx-0.5", ticking && !paused ? "animate-[pulse_1.5s_infinite]" : "opacity-40")}>:</span>
          <span>{ss}</span>
        </div>
        <TimerMeta elapsedMs={elapsedMs} pct={pct} paused={paused} />
      </div>
    </div>
  );
}

function FlipUnit({ value, label }: { value: string; label: string }) {
  const [prev, setPrev] = useState(value);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (value === prev) return;
    setFlipping(true);
    const t = setTimeout(() => {
      setPrev(value);
      setFlipping(false);
    }, 240);
    return () => clearTimeout(t);
  }, [value, prev]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-36 sm:w-36 sm:h-44 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm overflow-hidden [perspective:500px]">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-6xl sm:text-7xl font-medium text-on-surface tabular-nums">{value}</span>
        </div>
        <div className="absolute left-0 right-0 top-1/2 h-px bg-outline-variant" />
        {flipping && (
          <div
            key={value}
            className="absolute inset-x-0 top-0 h-1/2 overflow-hidden origin-bottom animate-flip z-10"
          >
            <div className="h-[200%] flex items-center justify-center">
              <span className="font-mono text-6xl sm:text-7xl font-medium text-on-surface tabular-nums">{prev}</span>
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 pb-2 flex items-center justify-center">
          <span className="font-mono text-code-badge uppercase tracking-[0.2em] text-on-surface-variant">{label}</span>
        </div>
      </div>
    </div>
  );
}

/** Variant 2 — split-flap inspired flip clock. Same countdown state. */
export function TimerFlip({ mm, ss, pct, paused, elapsedMs }: TimerProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center select-text py-4">
      <span className="font-mono text-code-badge uppercase tracking-widest text-on-surface-variant mb-3 font-medium">
        Time Remaining
      </span>
      <div className="flex items-start justify-center gap-2 sm:gap-3">
        <FlipUnit value={mm} label="min" />
        <span className="font-mono text-5xl sm:text-6xl text-primary font-medium pt-8 sm:pt-11 animate-[pulse_1.5s_infinite]">:</span>
        <FlipUnit value={ss} label="sec" />
      </div>
      <TimerMeta elapsedMs={elapsedMs} pct={pct} paused={paused} />
    </div>
  );
}

/** Angles for the analog variant. Hands sweep forward monotonically (never
 * spinning backwards across the 12) while a session runs. */
export function clockAngles(elapsedMs: number, plannedMs: number): {
  pct: number;
  minute: number;
  second: number;
} {
  const pct = plannedMs > 0 ? Math.min(100, (elapsedMs / plannedMs) * 100) : 0;
  const span = Math.max(1, plannedMs);
  return {
    pct,
    minute: (elapsedMs / span) * 360,
    second: (elapsedMs / 1000 / 60) * 360,
  };
}

/** Variant 3 — minimalist analog countdown. Same countdown state. */
export function TimerAnalog({ paused, elapsedMs, plannedMs, mm, ss }: TimerProps) {
  const { pct, minute, second } = clockAngles(elapsedMs, plannedMs);
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const sweep = {
    transformBox: "view-box",
    transformOrigin: "150px 150px",
    transition: "transform 0.95s linear",
  } as const;
  return (
    <div className="flex flex-col items-center justify-center text-center select-text">
      <span className="font-mono text-code-badge uppercase tracking-widest text-on-surface-variant mb-1 font-medium">
        Time Remaining
      </span>
      <svg className="w-[min(58vw,220px)] h-[min(58vw,220px)] sm:w-[240px] sm:h-[240px]" viewBox="0 0 300 300" fill="none">
        <circle cx="150" cy="150" r="140" className="stroke-surface-container-high" strokeWidth="4" />
        <circle
          cx="150" cy="150" r="140"
          className={cn("transition-all duration-700 ease-out", paused ? "stroke-secondary" : "stroke-primary")}
          strokeWidth="4" strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 140}
          strokeDashoffset={2 * Math.PI * 140 * (1 - pct / 100)}
          transform="rotate(-90 150 150)"
        />
        {ticks.map((i) => {
          const major = i % 5 === 0;
          const a = (i / 60) * Math.PI * 2;
          const r1 = major ? 124 : 130;
          const r2 = 134;
          return (
            <line
              key={i}
              x1={150 + r1 * Math.sin(a)} y1={150 - r1 * Math.cos(a)}
              x2={150 + r2 * Math.sin(a)} y2={150 - r2 * Math.cos(a)}
              className={major ? "stroke-on-surface-variant" : "stroke-surface-container-highest"}
              strokeWidth={major ? 2.5 : 1.5}
              strokeLinecap="round"
            />
          );
        })}
        <line
          x1="150" y1="150" x2="150" y2="62"
          className="stroke-on-surface"
          strokeWidth="5" strokeLinecap="round"
          style={{ ...sweep, transform: `rotate(${minute}deg)` }}
        />
        <line
          x1="150" y1="165" x2="150" y2="38"
          className="stroke-tertiary"
          strokeWidth="2" strokeLinecap="round"
          style={{ ...sweep, transform: `rotate(${second}deg)` }}
        />
        <circle cx="150" cy="150" r="6" className="fill-primary" />
      </svg>
      <div className="font-mono text-xl sm:text-2xl font-medium text-on-surface tabular-nums mt-1 leading-none">
        {mm}<span className="text-primary mx-0.5">:</span>{ss}
      </div>
      <TimerMeta elapsedMs={elapsedMs} pct={pct} paused={paused} />
    </div>
  );
}
