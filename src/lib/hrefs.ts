import { IS_DESKTOP } from "@/lib/platform";

/**
 * Link helpers. The web app uses clean dynamic routes (/tasks/:id); the
 * static desktop export can't pre-render unknown ids, so it uses a query
 * parameter instead (/tasks/detail/?id=...). The target page reads the id
 * through `useRouteId`, so both link shapes resolve identically.
 */
export function taskHref(id: string): string {
  return IS_DESKTOP
    ? `/tasks/detail/?id=${encodeURIComponent(id)}`
    : `/tasks/${encodeURIComponent(id)}`;
}

export function sessionHref(id: string): string {
  return IS_DESKTOP
    ? `/history/detail/?id=${encodeURIComponent(id)}`
    : `/history/${encodeURIComponent(id)}`;
}
