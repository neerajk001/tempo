import type { Metadata } from "next";
import BreakView from "@/components/pomodoro/BreakView";

// Timer-flow state, not a landing page — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Break",
  robots: { index: false, follow: false },
};

export default function BreakPage() {
  return <BreakView />;
}
