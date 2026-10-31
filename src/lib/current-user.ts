import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyDesktopToken } from "@/lib/desktop-auth";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Resolve the authenticated user server-side (never trust client userId).
 * Creates the User row on first login.
 * NOTE: Legacy rows with NULL userId are NOT auto-claimed (would leak
 * data across users on a shared DB). Migration must be explicit/opt-in.
 * Returns null when unauthenticated — callers respond 401.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user;
  const email = sessionUser?.email?.toLowerCase().trim();
  if (!email) return null;

  const name = sessionUser?.name ?? undefined;
  const image = (sessionUser as { image?: string | null } | undefined)?.image ?? undefined;

  const user = await db.user.upsert({
    where: { email },
    update: { name, image },
    create: { email, name, image },
    select: { id: true, email: true },
  });

  return user;
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Sign in to access your data.", needsAuth: true },
    { status: 401 }
  );
}

/**
 * Resolve the caller from either the browser session cookie or a desktop
 * Bearer token. The desktop token is scoped to a single user id and signed
 * server-side, so it is never trusted from client input.
 */
export async function getCurrentUserFromRequest(
  req: Request
): Promise<CurrentUser | null> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const claims = await verifyDesktopToken(header.slice(7).trim(), "sync");
    if (!claims) return null;
    return db.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true },
    });
  }
  return getCurrentUser();
}
