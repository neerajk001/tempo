"use client";

import { signIn, signOut } from "next-auth/react";
import { clearLocalTempoData } from "@/lib/local-data";

export function signInWithGoogle(): void {
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
  void signOut({ callbackUrl: "/" });
}
