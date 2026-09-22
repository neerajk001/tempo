import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Google sign-in only. No Calendar/API scopes are requested — Tempo never
// reads Google user data beyond the basic profile needed for sign-in.
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (process.env.NODE_ENV === "production" && (!clientId || !clientSecret)) {
  throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
}

if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_SECRET) {
  throw new Error("Missing NEXTAUTH_SECRET — set a strong random value");
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: clientId ?? "",
      clientSecret: clientSecret ?? "",
    }),
  ],
  session: { strategy: "jwt" },
};
