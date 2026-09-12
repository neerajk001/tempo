import type { Metadata } from "next";
import FocusView from "@/components/pomodoro/FocusView";

export const metadata: Metadata = {
  title: "Online Pomodoro Timer — Full-Screen Focus Mode",
  description:
    "Distraction-free online Pomodoro timer with circular, flip-clock, and analog faces, ambient focus videos and music, pause/resume, and open-ended Infinite Focus for deep work sessions.",
  alternates: { canonical: "/focus" },
};

export default function FocusPage() {
  return <FocusView />;
}
