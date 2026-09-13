import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import AuthSessionProvider from "@/components/providers/SessionProvider";
import ServiceWorkerRegister from "@/components/providers/ServiceWorkerRegister";
import GlobalShortcuts from "@/components/providers/GlobalShortcuts";
import SyncManager from "@/components/providers/SyncManager";
import GuestLifecycle from "@/components/providers/GuestLifecycle";
import { AmbientMusic } from "@/components/ambient/AmbientMusic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://tempo.neerajx.site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tempo — Free Online Pomodoro Timer & Focus Planner",
    template: "%s | Tempo Pomodoro",
  },
  description:
    "Tempo is a free online Pomodoro timer with task planning, open-ended Infinite Focus sessions, ambient focus music and videos, session history analytics, and daily review. No sign-up needed to start focusing.",
  keywords: [
    "pomodoro",
    "pomodoro timer",
    "free pomodoro timer",
    "online pomodoro timer",
    "pomodoro technique",
    "focus timer",
    "deep work timer",
    "study timer",
    "adhd focus timer",
    "time blocking planner",
    "productivity timer",
  ],
  authors: [{ name: "Tempo" }],
  creator: "Tempo",
  publisher: "Tempo",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Tempo" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Tempo",
    title: "Tempo — Free Online Pomodoro Timer & Focus Planner",
    description:
      "Free Pomodoro timer with task planning, Infinite Focus sessions, ambient focus library, and history analytics. Start focusing in one click.",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "Tempo Pomodoro Timer",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Tempo — Free Online Pomodoro Timer & Focus Planner",
    description:
      "Free Pomodoro timer with task planning, Infinite Focus sessions, and focus analytics.",
    images: ["/icons/icon-512.png"],
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Tempo Pomodoro Timer",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Free online Pomodoro timer with task planning, open-ended focus sessions, ambient focus library, and session history analytics.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export const viewport: Viewport = {
  themeColor: "#12110f",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Geist + JetBrains Mono per DESIGN.md reference; loaded once in root layout. */}
      <head>
        {/* eslint-disable @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        {/* eslint-enable @next/next/no-page-custom-font */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body>
        <AuthSessionProvider>
          <div className="flex flex-col min-h-screen">
            <TopBar />
            <div className="flex flex-col md:flex-row flex-1">
              <Sidebar />
              <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full mx-auto max-w-[1440px] min-w-0">{children}</main>
            </div>
          </div>
          <ServiceWorkerRegister />
          <GlobalShortcuts />
          <SyncManager />
          <GuestLifecycle />
          {/* Global music player — survives route changes and exiting Focus Mode, driven only by the ambient store. */}
          <AmbientMusic />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
