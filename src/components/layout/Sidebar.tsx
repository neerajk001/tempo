"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import Icon from "@/components/ui/Icon";
import { AVATAR_SRC } from "@/lib/assets";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: "grid_view" },
  { href: "/", label: "Today", icon: "schedule", exact: true },
  { href: "/tasks", label: "Tasks", icon: "task_alt" },
  { href: "/calendar", label: "Calendar", icon: "calendar_month" },
  { href: "/history", label: "History", icon: "bar_chart" },
  { href: "/library", label: "Focus Library", icon: "video_library" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? "neeraj@tempo.io";
  const name = session?.user?.name?.split(" ")[0] ?? "Neeraj";
  const avatar = session?.user?.image ?? AVATAR_SRC;

  return (
    <aside className="w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-outline-variant bg-surface-container-lowest md:min-h-[calc(100vh-4rem)] md:sticky md:top-0 md:self-start md:overflow-y-auto p-3 md:p-4 flex md:flex-col gap-1">
      <div className="hidden md:block px-2 pt-1 pb-3 text-label-xs font-medium uppercase tracking-wider text-secondary">
        Workspaces
      </div>
      <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto flex-1 items-center md:items-stretch">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 h-9 text-body-sm whitespace-nowrap border border-transparent",
                active
                  ? "bg-primary-fixed/60 border-primary/20 text-on-surface font-semibold"
                  : "text-secondary hover:bg-surface-container-low font-medium"
              )}
            >
              <Icon name={item.icon} className={cn("text-[20px]", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden md:flex flex-col gap-1 pt-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 h-9 text-body-sm border border-transparent",
            pathname === "/settings"
              ? "bg-primary-fixed/60 border-primary/20 text-on-surface font-semibold"
              : "text-secondary hover:bg-surface-container-low font-medium"
          )}
        >
          <Icon name="tune" className={cn("text-[20px]", pathname === "/settings" && "text-primary")} />
          Settings
        </Link>
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-container-low transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-outline" />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-body-sm font-semibold text-on-surface truncate">{name}</div>
            <div className="text-label-xs text-secondary truncate">{email}</div>
          </div>
          {status === "authenticated" ? (
            <button
              type="button"
              title="Sign out"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-secondary hover:text-on-surface"
            >
              <Icon name="unfold_more" className="text-[18px]" />
            </button>
          ) : (
            <button
              type="button"
              title="Sign in"
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="text-secondary hover:text-on-surface"
            >
              <Icon name="login" className="text-[18px]" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
