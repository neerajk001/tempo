import type { Metadata } from "next";
import DashboardHome from "@/components/dashboard/DashboardHome";

export const metadata: Metadata = {
  title: "Free Online Pomodoro Timer & Focus Planner",
  description:
    "Start a free Pomodoro timer in one click. Plan tasks, run 25/50-minute focus blocks or open-ended Infinite Focus, and review your day — no sign-up needed.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <DashboardHome />;
}
