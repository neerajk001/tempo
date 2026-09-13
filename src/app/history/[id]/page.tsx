"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import SessionInspector from "@/components/history/SessionInspector";
import { useSessionHistoryStore } from "@/stores/session-history-store";

export default function SessionDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionHistoryStore((s) => s.sessions.find((x) => x.id === params.id));

  if (!session) {
    return (
      <div className="space-y-4 max-w-lg">
        <h1 className="text-headline-lg text-on-surface">Session</h1>
        <Card>
          <p className="text-sm">We couldn’t find that session. It may have been deleted.</p>
          <Link href="/history" className="text-sm underline">
            Back to history
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link href="/history" className="text-sm underline text-secondary">
        ← History
      </Link>
      <div className="mt-3">
        <SessionInspector record={session} onDeleted={() => router.push("/history")} />
      </div>
    </div>
  );
}
