"use client";

import { useState } from "react";
import type { Task } from "@/stores/task-store";
import type { QuickCredit } from "@/stores/pomodoro-store";
import { cn } from "@/lib/utils";

/** First open candidate, preferring the in-progress one. */
export function defaultCreditFor(tasks: Task[]): QuickCredit | null {
  const t =
    tasks.find((x) => x.status === "IN_PROGRESS") ??
    tasks.find((x) => x.status === "TODO") ??
    tasks[0];
  return t ? { taskId: t.id, taskTitle: t.title } : null;
}

/**
 * Attribution choice state. Starts undecided so late-loading tasks still
 * resolve to a sensible default; explicit user picks always win.
 */
export function useCreditChoice(candidates: Task[]) {
  const [override, setOverride] = useState<QuickCredit | null | undefined>(
    undefined
  );
  const credit = override === undefined ? defaultCreditFor(candidates) : override;
  return [credit, setOverride] as const;
}

/**
 * Explicit attribution choice for a quick session: count its finished
 * minutes toward an in-progress task, or keep it independent.
 * Controlled: `value` null = independent. Renders nothing without candidates.
 */
export default function QuickCreditPicker({
  tasks,
  value,
  onChange,
}: {
  tasks: Task[];
  value: QuickCredit | null;
  onChange: (c: QuickCredit | null) => void;
}) {
  if (tasks.length === 0) return null;
  const selectedId = value?.taskId ?? tasks[0].id;
  const pickTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (t) onChange({ taskId: t.id, taskTitle: t.title });
  };

  const row =
    "flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label-xs uppercase tracking-wider text-on-surface-variant font-semibold">
        Where should these minutes count?
      </span>
      <label
        className={cn(
          row,
          value !== null
            ? "bg-primary-fixed/50 border border-primary/25"
            : "bg-surface-container-low hover:bg-surface-container border border-transparent"
        )}
      >
        <input
          type="radio"
          name="quick-credit"
          checked={value !== null}
          onChange={() => pickTask(selectedId)}
          className="mt-0.5 accent-primary cursor-pointer"
        />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-body-sm font-medium text-on-surface">
            Count in an in-progress task
          </span>
          {value !== null && (
            <select
              value={selectedId}
              onChange={(e) => pickTask(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-8 rounded-lg bg-surface-container-lowest border border-outline-variant/30 px-2 text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container max-w-full"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </label>
      <label
        className={cn(
          row,
          value === null
            ? "bg-primary-fixed/50 border border-primary/25"
            : "bg-surface-container-low hover:bg-surface-container border border-transparent"
        )}
      >
        <input
          type="radio"
          name="quick-credit"
          checked={value === null}
          onChange={() => onChange(null)}
          className="mt-0.5 accent-primary cursor-pointer"
        />
        <div className="flex flex-col">
          <span className="text-body-sm font-medium text-on-surface">
            Keep it separate
          </span>
          <span className="text-label-xs text-on-surface-variant">
            Logs to History, counts toward no task.
          </span>
        </div>
      </label>
    </div>
  );
}
