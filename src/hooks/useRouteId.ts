"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { IS_DESKTOP } from "@/lib/platform";

/**
 * Resolve the current record id on both platforms:
 * - web: the dynamic route segment (`/tasks/[id]`)
 * - desktop static export: the `?id=` query parameter (`/tasks/detail/?id=`)
 *
 * Starts empty on the server render so hydration matches, then fills in from
 * the query string on the client (desktop only).
 */
export function useRouteId(): string {
  const params = useParams<{ id?: string }>();
  const [id, setId] = useState<string>(() => (IS_DESKTOP ? "" : params?.id ?? ""));

  useEffect(() => {
    if (!IS_DESKTOP) return;
    const query = new URLSearchParams(window.location.search).get("id");
    if (query) setId(query);
  }, []);

  return id;
}
