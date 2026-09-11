"use client";

import Icon from "@/components/ui/Icon";
import { formatDurationMinutes } from "@/lib/utils";

export interface RibbonData {
  plannedMinutes: number;
  focusedMinutes: number;
  remainingMinutes: number;
  completedPomodoros: number;
  plannedPomodoros: number;
  interruptions: number;
  pausedMs: number;
  focusRate: number;
  rateDelta: number | null;
}

function HM({ minutes, accent }: { minutes: number; accent?: boolean }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const cls = accent ? "text-primary" : "text-on-surface";
  const sub = accent ? "text-primary/70" : "text-secondary";
  return (
    <span className={`font-mono text-metric-mono-lg font-medium tracking-tight ${cls}`}>
      {h}
      <span className={`text-body-sm ml-0.5 ${sub}`}>h</span> {String(m).padStart(2, "0")}
      <span className={`text-body-sm ml-0.5 ${sub}`}>m</span>
    </span>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between p-3 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant hover:border-outline transition-colors min-h-[118px]">
      {children}
    </div>
  );
}

function Label({ icon, children, accent }: { icon: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-label-xs ${accent ? "text-primary" : "text-secondary"}`}>
      <span className={`uppercase tracking-wide font-medium flex items-center gap-1 ${accent ? "font-semibold" : ""}`}>
        {children}
      </span>
      <Icon name={icon} className={`text-[14px] ${accent ? "text-primary" : "text-secondary"}`} />
    </div>
  );
}

export default function MetricRibbon({ d }: { d: RibbonData }) {
  const focusPct = d.plannedMinutes > 0 ? Math.min(100, Math.round((d.focusedMinutes / d.plannedMinutes) * 100)) : d.focusedMinutes > 0 ? 100 : 0;
  const remainPct = d.plannedMinutes > 0 ? Math.min(100, Math.round((d.remainingMinutes / d.plannedMinutes) * 100)) : 0;
  const pomoPct = d.plannedPomodoros > 0 ? Math.min(100, Math.round((d.completedPomodoros / d.plannedPomodoros) * 100)) : d.completedPomodoros > 0 ? 100 : 0;
  const avgPaused = d.interruptions > 0 ? d.pausedMs / d.interruptions / 60000 : 0;
  const segs = Math.max(d.plannedPomodoros, d.completedPomodoros, 1);
  const quickOnly = d.plannedPomodoros === 0 && d.completedPomodoros > 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 w-full">
      <CardShell>
        <Label icon="calendar_today">Planned</Label>
        <div className="mt-1"><HM minutes={d.plannedMinutes} /></div>
        <div className="w-full bg-surface-container-high h-1 rounded-full mt-2 overflow-hidden">
          <div className="bg-secondary h-full rounded-full w-full" />
        </div>
      </CardShell>

      <CardShell>
        <Label icon="timer" accent>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          Focused
        </Label>
        <div className="mt-1"><HM minutes={d.focusedMinutes} accent /></div>
        <div className="w-full bg-primary-fixed h-1 rounded-full mt-2 overflow-hidden">
          <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${focusPct}%` }} />
        </div>
      </CardShell>

      <CardShell>
        <Label icon="hourglass_empty">Remaining</Label>
        <div className="mt-1"><HM minutes={d.remainingMinutes} /></div>
        <div className="w-full bg-surface-container-high h-1 rounded-full mt-2 overflow-hidden">
          <div className="bg-secondary-fixed-dim h-full rounded-full" style={{ width: `${remainPct}%` }} />
        </div>
      </CardShell>

      <CardShell>
        <Label icon="check_circle">Pomodoros</Label>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-mono text-metric-mono-lg font-medium text-on-surface tracking-tight">
            {d.completedPomodoros} <span className="text-body-sm text-secondary font-normal">{quickOnly ? "quick" : `/ ${d.plannedPomodoros}`}</span>
          </span>
          <span className="font-mono text-code-badge text-secondary font-semibold">{pomoPct}%</span>
        </div>
        <div className="flex items-center gap-1 mt-2">
          {Array.from({ length: segs }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < d.completedPomodoros ? "bg-primary" : i === d.completedPomodoros && d.completedPomodoros < d.plannedPomodoros ? "bg-primary-fixed animate-pulse" : "bg-surface-container-high"}`}
            />
          ))}
        </div>
      </CardShell>

      <CardShell>
        <Label icon="notifications_paused">Interruptions</Label>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-mono text-metric-mono-lg font-medium text-on-surface tracking-tight">
            {d.interruptions} <span className="text-body-sm text-secondary">logged</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-label-xs mt-2">
          <span className="text-on-surface-variant font-mono text-code-badge">avg ~{avgPaused.toFixed(1)}m</span>
          <span className="text-secondary font-mono text-code-badge">{formatDurationMinutes(Math.round(d.pausedMs / 60000))} total</span>
        </div>
      </CardShell>

      <CardShell>
        <Label icon="insights">Focus Rate</Label>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-mono text-metric-mono-lg font-semibold text-primary tracking-tight">
            {d.focusRate}<span className="text-body-sm text-primary">%</span>
          </span>
          {d.rateDelta !== null && (
            <span className="font-mono text-code-badge text-primary bg-primary-fixed px-1 py-0.5 rounded font-medium">
              {d.rateDelta >= 0 ? "+" : ""}{d.rateDelta.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="w-full bg-surface-container-high h-1 rounded-full mt-2 overflow-hidden">
          <div className="bg-primary h-full rounded-full" style={{ width: `${d.focusRate}%` }} />
        </div>
      </CardShell>
    </div>
  );
}
