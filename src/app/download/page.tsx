import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { RELEASES_URL, WINDOWS_INSTALLER_URL } from "@/lib/downloads";

export const metadata: Metadata = {
  title: "Download Tempo for Windows",
  description:
    "Install the native Tempo desktop app: offline Pomodoro timer, tray controls, floating mini timer, native notifications, and Focus Guard site blocking.",
  alternates: { canonical: "/download" },
};

const FEATURES = [
  { icon: "cloud_off", title: "Works offline", body: "The full app is bundled. No server, no network, no account." },
  { icon: "notifications_active", title: "Native alerts", body: "Real Windows notifications and a completion chime, even when the window is hidden." },
  { icon: "picture_in_picture_alt", title: "Mini timer", body: "A small always-on-top widget that shows the live clock over any app." },
  { icon: "keyboard", title: "Global hotkey", body: "Ctrl+Shift+Space shows or hides Tempo from anywhere." },
  { icon: "shield", title: "Focus Guard", body: "Block distracting sites while a focus block runs, using the Windows hosts file." },
  { icon: "desktop_windows", title: "Lives in the tray", body: "Closing the window keeps the timer running. Window size, position, and start-on-login are remembered." },
];

const STEPS = [
  "Download the installer and run it. It installs for your user — no administrator prompt.",
  "If Windows SmartScreen appears, choose More info → Run anyway. The build is unsigned.",
  "Tempo opens. Closing the window sends it to the tray; quit from the tray menu.",
];

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <div className="mx-auto w-full max-w-4xl px-5 sm:px-8 py-12 sm:py-20">
        <Link href="/" className="text-body-sm text-secondary hover:text-on-surface transition-colors">
          ← Back to Tempo
        </Link>

        <div className="mt-10 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="7" x2="12" y2="12" />
              <line x1="12" y1="12" x2="15" y2="15" />
            </svg>
          </span>
          <span className="text-headline-md font-semibold tracking-tight">Tempo</span>
        </div>

        <h1 className="mt-6 text-[34px] sm:text-[44px] leading-[1.1] font-semibold tracking-tight text-on-surface">
          Tempo for Windows
        </h1>
        <p className="mt-4 max-w-xl text-body-md text-on-surface-variant">
          The whole focus console as a native app: offline timing, tray controls, a floating mini
          timer, native alerts, and site blocking. Your tasks, sessions, and settings stay on this PC.
        </p>

        <div className="mt-8">
          <a
            href={WINDOWS_INSTALLER_URL}
            className="inline-flex items-center gap-2.5 h-12 px-6 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-container transition-colors shadow-sm"
          >
            <Icon name="download" className="text-[20px]" />
            Download for Windows
          </a>
          <p className="mt-3 text-body-sm text-secondary">
            Windows 10/11 · 64-bit · about 15 MB · no account required
          </p>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            The installer is unsigned, so Windows may ask you to confirm before running it.
          </p>
        </div>

        <section aria-labelledby="features" className="mt-14">
          <h2 id="features" className="text-headline-lg tracking-tight">What&apos;s different from the browser</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 flex gap-3">
                <span className="w-8 h-8 shrink-0 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                  <Icon name={f.icon} className="text-[18px]" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-body-md font-semibold text-on-surface">{f.title}</h3>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="install" className="mt-12">
          <h2 id="install" className="text-headline-lg tracking-tight">Install in three steps</h2>
          <ol className="mt-4 space-y-2">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
                <span className="w-6 h-6 shrink-0 rounded-full bg-primary-fixed text-on-primary-fixed text-code-badge font-mono font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-body-sm text-on-surface-variant">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <h2 className="text-headline-md font-semibold text-on-surface">Local by design</h2>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            The desktop app is separate from the website. It stores tasks, history, and settings on
            this device only — nothing is uploaded, and it does not share data with your browser.
            Use Settings → Export to keep a JSON or CSV backup.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm">
          <Link href="/" className="text-primary hover:underline">Use Tempo in the browser instead</Link>
          <a href={RELEASES_URL} className="text-secondary hover:text-on-surface transition-colors">
            Release notes
          </a>
        </div>
      </div>
    </main>
  );
}
