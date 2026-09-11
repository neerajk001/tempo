"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { formatDurationMinutes } from "@/lib/utils";
import type { Task } from "@/stores/task-store";
import { usePomodoroStore } from "@/stores/pomodoro-store";
import { getRemainingMs } from "@/lib/pomodoro-machine";
import { useNow } from "@/hooks/useNow";
import { useState } from "react";
import { useDiversionStore } from "@/stores/diversion-store";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function UpNextCard({ tasks }: { tasks: Task[] }) {
  const session = usePomodoroStore((s) => s.session);
  const now = useNow(session.status === "RUNNING" || session.status === "PAUSED");
  const next = tasks.filter((t) => t.status === "TODO").sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity))[0] ?? null;
  const breakInMin = session.status === "RUNNING" ? Math.max(0, Math.ceil(getRemainingMs(session, now) / 60000)) : null;

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="forward" className="text-[18px] text-tertiary" />
          <span className="text-headline-md text-on-surface font-semibold">Up Next</span>
        </div>
        <span className="font-mono text-code-badge text-secondary font-medium">
          {next?.startMs ? `${fmtTime(next.startMs)} Start` : "Queue"}
        </span>
      </div>
      {next ? (
        <div className="bg-surface-container-low rounded-lg p-3 flex flex-col gap-0.5">
          <div className="text-body-sm font-semibold text-on-surface">{next.title}</div>
          <div className="text-label-xs text-on-surface-variant flex items-center justify-between">
            <span>
              {next.startMs && next.startMs > Date.now()
                ? `Next session in ${formatDurationMinutes(Math.round((next.startMs - Date.now()) / 60000))}`
                : "Ready when you are"}
            </span>
            <span className="font-mono text-code-badge font-medium text-primary">
              {formatDurationMinutes(next.allocatedMinutes)} deep block
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-surface-container-low rounded-lg p-3 text-body-sm text-secondary">
          Queue is clear. Plan the next block.
        </div>
      )}
      <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-surface-container-high text-on-surface">
        <div className="w-7 h-7 rounded-md bg-surface-container-lowest flex items-center justify-center flex-shrink-0 text-on-secondary-container">
          <Icon name="local_cafe" className="text-[16px]" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-label-xs font-semibold text-on-surface">
            {breakInMin !== null ? `Next break in ${breakInMin} min` : "No active session"}
          </span>
          <span className="text-label-xs text-secondary truncate">5m hydration & eye stretch recommended</span>
        </div>
      </div>
    </div>
  );
}

export function PlannedActualCard({
  plannedMinutes,
  focusedMinutes,
  remainingMinutes,
  focusRate,
}: {
  plannedMinutes: number;
  focusedMinutes: number;
  remainingMinutes: number;
  focusRate: number;
}) {
  const total = Math.max(1, plannedMinutes);
  const actualPct = Math.min(100, Math.round((focusedMinutes / total) * 100));
  const doneH = (focusedMinutes / 60).toFixed(1);
  const planH = (plannedMinutes / 60).toFixed(1);
  const finish = new Date(Date.now() + remainingMinutes * 60000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="data_usage" className="text-[18px] text-primary" />
          <span className="text-headline-md text-on-surface font-semibold">Planned vs Actual</span>
        </div>
        <span className="font-mono text-code-badge text-primary bg-primary-fixed px-1.5 py-0.5 rounded font-semibold">
          {focusRate}% On Track
        </span>
      </div>
      <div className="py-0.5">
        <div className="flex items-center justify-between text-label-xs text-secondary mb-1.5">
          <span>Current day distribution</span>
          <span className="font-mono text-code-badge font-medium text-on-surface">{doneH}h of {planH}h done</span>
        </div>
        <div className="w-full h-4 rounded-md overflow-hidden flex">
          <div className="bg-primary h-full" style={{ width: `${actualPct}%` }} />
          <div className="bg-surface-container-highest h-full flex-1" />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-label-xs text-on-surface-variant">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Actual: {formatDurationMinutes(focusedMinutes)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-surface-container-highest" />
            <span>Pending: {formatDurationMinutes(remainingMinutes)}</span>
          </div>
        </div>
      </div>
      <p className="text-body-sm text-secondary bg-surface-container-low p-1.5 rounded-lg">
        {remainingMinutes > 0
          ? `At current velocity, you will complete all planned deep blocks by ${finish} without overtime.`
          : plannedMinutes === 0 && focusedMinutes > 0
            ? "Allocation-free focus — no plan to beat. Wrap up with a review."
            : "All planned deep blocks are complete. Wrap up with a review."}
      </p>
    </div>
  );
}

export function InterruptionLogCard({
  autoRows,
  pausedMs,
}: {
  autoRows: Array<{ id: string; title: string; detail: string; minutes: number }>;
  pausedMs: number;
}) {
  const diversions = useDiversionStore((s) => s.diversions);
  const addDiversion = useDiversionStore((s) => s.addDiversion);
  const removeDiversion = useDiversionStore((s) => s.removeDiversion);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const todayKey = new Date();
  const y = todayKey.getFullYear();
  const m = String(todayKey.getMonth() + 1).padStart(2, "0");
  const d = String(todayKey.getDate()).padStart(2, "0");
  const key = `${y}-${m}-${d}`;
  const todayDiversions = diversions.filter((x) => {
    const t = new Date(x.at);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}` === key;
  });
  const divMinutes = todayDiversions.reduce((s, x) => s + x.minutes, 0);

  const submit = () => {
    try {
      addDiversion(title, minutes);
      setTitle("");
      setMinutes(5);
      setError(null);
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log diversion");
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="warning" className="text-[18px] text-error" />
          <span className="text-headline-md text-on-surface font-semibold">Interruption Log</span>
        </div>
        <span className="font-mono text-code-badge text-secondary font-semibold">
          {formatDurationMinutes(Math.round(pausedMs / 60000) + divMinutes)} total
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {autoRows.length === 0 && todayDiversions.length === 0 && (
          <p className="text-body-sm text-secondary px-1.5 py-1">Undisturbed so far.</p>
        )}
        {autoRows.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-1.5 rounded hover:bg-surface-container-low transition-colors text-body-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-outline flex-shrink-0" />
              <span className="text-on-surface truncate">{r.title}</span>
            </div>
            <span className="font-mono text-code-badge text-secondary flex-shrink-0 ml-2">{r.minutes}m</span>
          </div>
        ))}
        {todayDiversions.map((x) => (
          <div key={x.id} className="flex items-center justify-between p-1.5 rounded hover:bg-surface-container-low transition-colors text-body-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-outline flex-shrink-0" />
              <span className="text-on-surface truncate">{x.title}</span>
            </div>
            <span className="flex items-center gap-1 flex-shrink-0 ml-2">
              <span className="font-mono text-code-badge text-secondary">{x.minutes}m</span>
              <button type="button" title="Remove" onClick={() => removeDiversion(x.id)} className="text-secondary hover:text-error text-sm leading-none">×</button>
            </span>
          </div>
        ))}
      </div>
      {formOpen ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What pulled you away?"
              className="flex-1 min-w-0 h-8 rounded-lg border border-outline bg-surface-container-lowest px-2.5 text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
            />
            <input
              type="number"
              value={minutes}
              min={1}
              max={480}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-16 h-8 rounded-lg border border-outline bg-surface-container-lowest px-2 text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
            <button type="button" onClick={submit} className="h-8 px-3 rounded-lg bg-primary text-on-primary text-body-sm font-medium">Log</button>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full h-7 rounded bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-mono text-code-badge font-medium transition-colors inline-flex items-center justify-center gap-1"
        >
          <Icon name="add" className="text-[13px]" />
          <span>Log quick diversion</span>
        </button>
      )}
    </div>
  );
}

export function StandbyCard() {
  const router = useRouter();
  const reset = usePomodoroStore((s) => s.reset);
  const start = usePomodoroStore((s) => s.start);

  return (
    <div className="rounded-xl bg-gradient-to-br from-surface-container-low to-surface-container-high border border-outline-variant p-4 flex flex-col gap-1.5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-headline-md text-on-surface font-semibold">Standby Mode</span>
        <Icon name="wb_sunny" className="text-[18px] text-secondary" />
      </div>
      <p className="text-body-sm text-on-surface-variant">
        Ready to wrap early or shift contexts? Jump into a pure review state.
      </p>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <Link
          href="/review"
          className="h-8 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container-low shadow-sm text-body-sm font-medium transition-all inline-flex items-center"
        >
          Quick Review
        </Link>
        <button
          type="button"
          onClick={() => {
            reset();
            start();
            router.push("/focus");
          }}
          className="h-8 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container shadow-sm text-body-sm font-medium transition-all"
        >
          Start New Session
        </button>
      </div>
    </div>
  );
}
