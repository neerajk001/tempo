import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import AuthSessionProvider from "@/components/providers/SessionProvider";
import ServiceWorkerRegister from "@/components/providers/ServiceWorkerRegister";
import GlobalShortcuts from "@/components/providers/GlobalShortcuts";
import SyncManager from "@/components/providers/SyncManager";

export const metadata: Metadata = {
  title: "Tempo — Focus Console",
  description: "Personal Pomodoro productivity console: plan, focus, track, review.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Tempo" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
        </AuthSessionProvider>
      </body>
    </html>
  );
}
