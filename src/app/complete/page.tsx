import type { Metadata } from "next";
import CompleteView from "@/components/pomodoro/CompleteView";

// Timer-flow state, not a landing page — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Session Complete",
  robots: { index: false, follow: false },
};

export default function CompletePage() {
  return <CompleteView />;
}
