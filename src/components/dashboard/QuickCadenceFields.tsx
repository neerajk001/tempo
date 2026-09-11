"use client";

import Icon from "@/components/ui/Icon";

/**
 * Per-quick-session break cadence: short break, long break, and after how
 * many focus sessions the long break lands. Scoped to the quick flow only —
 * workspace Settings are never touched.
 */
export default function QuickCadenceFields({
  shortBreakMin,
  longBreakMin,
  interval,
  onShort,
  onLong,
  onInterval,
}: {
  shortBreakMin: number;
  longBreakMin: number;
  interval: number;
  onShort: (m: number) => void;
  onLong: (m: number) => void;
  onInterval: (n: number) => void;
}) {
  const num = (
    value: number,
    min: number,
    max: number,
    apply: (n: number) => void,
    label: string
  ) => (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-label-xs text-on-surface-variant font-medium">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value.trim() === "" || !Number.isFinite(n)) return;
          apply(Math.min(max, Math.max(min, Math.round(n))));
        }}
        className="h-8 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2 font-mono text-body-sm text-on-surface focus:outline-none focus:border-primary"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-surface-container-low/60 border border-outline-variant">
      <div className="flex items-center gap-1.5 text-on-surface-variant">
        <Icon name="self_improvement" className="text-[14px]" />
        <span className="text-label-xs font-semibold uppercase tracking-wider">
          Breaks for this run
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {num(shortBreakMin, 1, 60, onShort, "Short (min)")}
        {num(longBreakMin, 1, 120, onLong, "Long (min)")}
        {num(interval, 2, 12, onInterval, "Long every")}
      </div>
    </div>
  );
}
