"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import { AVATAR_SRC } from "@/lib/assets";

export default function TopBar() {
  const { data: session } = useSession();
  const avatar = session?.user?.image ?? AVATAR_SRC;

  return (
    <header className="w-full h-16 shrink-0 border-b border-outline-variant bg-surface-container-lowest/90 backdrop-blur flex items-center gap-4 px-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-primary">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="7" x2="12" y2="12" />
            <line x1="12" y1="12" x2="15" y2="15" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-on-surface">Tempo</span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-on-primary-fixed bg-primary-fixed px-1.5 py-0.5 rounded border border-primary/20">PRO</span>
      </Link>

      <Link
        href="/tasks"
        className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg bg-surface-container-low text-secondary text-body-sm hover:bg-surface-container transition-colors min-w-[180px] border border-outline-variant"
      >
        <Icon name="search" className="text-[16px]" />
        <span className="flex-1 text-left">Search tasks…</span>
        <kbd className="px-1.5 py-0.5 rounded border border-outline bg-surface-container-lowest font-mono text-[10px] text-secondary">⌘K</kbd>
      </Link>

      <div className="ml-auto flex items-center gap-1.5">
        <Link href="/settings" title="Account & settings">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar}
            alt="Account"
            className="w-8 h-8 rounded-full object-cover ring-1 ring-outline hover:ring-2 hover:ring-primary/50 transition-shadow"
          />
        </Link>
      </div>
    </header>
  );
}
