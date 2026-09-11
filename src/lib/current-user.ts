import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Resolve the authenticated user server-side (never trust client userId).
 * Creates the User row on first login and claims pre-auth legacy rows
 * (personal single-user app: rows with NULL userId belong to this user).
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

  // Claim legacy rows created before auth existed.
  await db.task.updateMany({ where: { userId: null }, data: { userId: user.id } });
  await db.pomodoroSession.updateMany({ where: { userId: null }, data: { userId: user.id } });

  return user;
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Sign in to access your data.", needsAuth: true },
    { status: 401 }
  );
}
