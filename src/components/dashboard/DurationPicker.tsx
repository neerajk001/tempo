"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export const QUICK_DURATIONS = [15, 25, 50, 90];
export const MIN_QUICK_MINUTES = 5;
export const MAX_QUICK_MINUTES = 180;

export function clampQuickMinutes(v: number, fallback = 25): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(
    MAX_QUICK_MINUTES,
    Math.max(MIN_QUICK_MINUTES, Math.round(v))
  );
}

/**
 * Preset pills + custom minutes input for allocation-free sessions.
 * Matches the engine clamp in `startQuick` (5–180m).
 */
export default function DurationPicker({
  minutes,
  onChange,
  compact = false,
}: {
  minutes: number;
  onChange: (m: number) => void;
  compact?: boolean;
}) {
  // Raw text while typing custom (null = not editing), so partial input
  // like "4" (aiming for "40") isn't yanked away by clamping.
  const [text, setText] = useState<string | null>(null);
  const customActive = !QUICK_DURATIONS.includes(minutes);
  const shown = text ?? (customActive ? String(minutes) : "");
  const pillH = compact ? "h-7" : "h-8";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center gap-1.5 w-full">
        {QUICK_DURATIONS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setText(null);
              onChange(m);
            }}
            className={cn(
              `flex-1 ${pillH} rounded-lg font-mono text-label-xs font-medium transition-colors`,
              minutes === m
                ? "bg-primary text-on-primary font-semibold"
                : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            )}
          >
            {m}m
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-label-xs text-on-surface-variant">
        <span className="flex-shrink-0">Custom:</span>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_QUICK_MINUTES}
          max={MAX_QUICK_MINUTES}
          value={shown}
          placeholder="e.g. 40"
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim() === "") return;
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(clampQuickMinutes(n, minutes));
          }}
          onBlur={() => setText(null)}
          className="h-7 w-20 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 font-mono text-label-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
        />
        <span className="flex-shrink-0">min (5–180)</span>
      </label>
    </div>
  );
}
