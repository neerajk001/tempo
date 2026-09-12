import type { Metadata } from "next";
import LibraryPage from "@/components/library/LibraryPage";

export const metadata: Metadata = {
  title: "Ambient Focus Music & Videos for Deep Work",
  description:
    "Pick ambient focus videos and lofi, piano, jazz, and rain background music to pair with your Pomodoro sessions. Mix, match, or mute either.",
  alternates: { canonical: "/library" },
};

export default function FocusLibraryRoute() {
  return <LibraryPage />;
}
