"use client";

import { signIn, signOut } from "next-auth/react";
import { clearLocalTempoData } from "@/lib/local-data";
import { IS_DESKTOP } from "@/lib/platform";

export function signInWithGoogle(): void {
  // The local desktop build has no accounts to sign into.
  if (IS_DESKTOP) return;
  void signIn("google", { callbackUrl: "/" });
}

/**
 * Sign out and clear this device's local data. The account's records live in
 * the database (the source of truth) and are pulled back on the next sign-in,
 * so the next person on this device starts from a clean guest state instead of
 * inheriting the previous account's data.
 */
export function signOutAndReset(): void {
  clearLocalTempoData();
  if (IS_DESKTOP) return;
  void signOut({ callbackUrl: "/" });
}
