"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import { CAL_SYNC_STAMP_KEY } from "@/lib/assets";

function relativeAgo(ms: number | null): string | null {
  if (ms === null) return null;
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

export function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHeader({ flowActive }: { flowActive: boolean }) {
  const { data: session, status } = useSession();
  const [syncStamp, setSyncStamp] = useState<number | null>(null);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CAL_SYNC_STAMP_KEY);
      setSyncStamp(v ? Number(v) : null);
    } catch {
      setSyncStamp(null);
    }
  }, []);

  const now = new Date();
  const dateLine = now
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();
  const name = session?.user?.name?.split(" ")[0] ?? "Neeraj";
  const ago = relativeAgo(syncStamp);

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-secondary text-label-xs uppercase tracking-wider">
            <span className="font-medium text-on-surface">{dateLine}</span>
            <span className="text-outline/40">•</span>
            <span className="px-1 py-px rounded bg-surface-container-high text-on-surface-variant font-mono text-code-badge font-medium">
              Week {isoWeek(now)}
            </span>
            {flowActive && (
              <>
                <span className="text-outline/40">•</span>
                <span className="flex items-center gap-1 text-primary font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Deep Flow State
                </span>
              </>
            )}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-headline-lg text-on-surface tracking-tight">
              {greetingForHour(now.getHours())}, {name}.
            </h1>
            <span className="text-on-surface-variant text-body-md hidden sm:inline">
              Here is what your timeline holds today.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <div className="inline-flex items-center bg-surface-container-lowest rounded-lg shadow-sm p-0.5 gap-0.5">
            <Link
              href="/history"
              title="Past days"
              className="w-8 h-8 flex items-center justify-center rounded text-secondary hover:bg-surface-container hover:text-on-surface transition-colors"
            >
              <Icon name="chevron_left" className="text-[16px]" />
            </Link>
            <span className="text-body-sm font-semibold px-1 text-on-surface">Today</span>
            <Link
              href="/plan"
              title="Plan ahead"
              className="w-8 h-8 flex items-center justify-center rounded text-secondary hover:bg-surface-container hover:text-on-surface transition-colors"
            >
              <Icon name="chevron_right" className="text-[16px]" />
            </Link>
          </div>
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container-lowest shadow-sm hover:bg-surface-container-low text-on-surface transition-colors text-body-sm"
          >
            <Icon name="sync" className="text-[16px] text-tertiary" />
            <span className="font-medium">Google Cal</span>
            <span className="w-1 h-1 rounded-full bg-outline-variant" />
            <span className="text-label-xs text-secondary">
              {status === "authenticated" ? (ago ?? "synced") : "connect"}
            </span>
          </Link>
          <Link
            href="/tasks"
            className="hidden lg:flex items-center gap-1 h-8 px-3 rounded-lg bg-surface-container text-on-surface-variant font-mono text-code-badge shadow-sm hover:bg-surface-container-high transition-colors"
          >
            <span>⌘K</span>
            <span className="text-secondary text-label-xs">Menu</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
