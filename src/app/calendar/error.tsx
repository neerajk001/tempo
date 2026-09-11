"use client";

import Link from "next/link";
import Icon from "@/components/ui/Icon";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 max-w-lg">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-accent-amber">
          <Icon name="warning" className="text-[20px]" />
          <h1 className="text-headline-md text-on-surface">Calendar view crashed</h1>
        </div>
        <p className="text-body-sm text-secondary">
          Something in this view failed to render. Your timer, tasks, and history are untouched.
          {error?.message ? ` (${error.message})` : ""}
        </p>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={reset}
            className="h-8 px-4 rounded-lg bg-primary-container text-on-primary hover:bg-primary text-body-sm font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="h-8 px-4 rounded-lg bg-surface-container-lowest border border-outline text-body-sm font-medium inline-flex items-center"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
