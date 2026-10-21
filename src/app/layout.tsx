import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppChrome from "@/components/layout/AppChrome";
import AuthSessionProvider from "@/components/providers/SessionProvider";
import ServiceWorkerRegister from "@/components/providers/ServiceWorkerRegister";
import GlobalShortcuts from "@/components/providers/GlobalShortcuts";
import SyncManager from "@/components/providers/SyncManager";
import GuestLifecycle from "@/components/providers/GuestLifecycle";
import DesktopBridge from "@/components/providers/DesktopBridge";
import { AmbientMusic } from "@/components/ambient/AmbientMusic";
import { IS_DESKTOP } from "@/lib/platform";

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body>
        <AuthSessionProvider>
          <AppChrome>{children}</AppChrome>
          <ServiceWorkerRegister />
          <GlobalShortcuts />
          <SyncManager />
          {/* Desktop data is local-only and never expires; the guest TTL would erase it. */}
          {IS_DESKTOP ? null : <GuestLifecycle />}
          <DesktopBridge />
          {/* Global music player — survives route changes and exiting Focus Mode, driven only by the ambient store. */}
          <AmbientMusic />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
