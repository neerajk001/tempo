import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

async function refreshGoogleToken(token: {
  refreshToken?: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken ?? "",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    return {
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
    };
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in: persist tokens (Phase 08 will move these to DB per-user)
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : 0,
          refreshToken: account.refresh_token ?? token.refreshToken,
          calendarError: undefined,
        };
      }
      if (Date.now() < (token.accessTokenExpires as number)) return token;
      if (!token.refreshToken) return { ...token, calendarError: "Expired" };
      const refreshed = await refreshGoogleToken({ refreshToken: token.refreshToken as string });
      if (!refreshed) return { ...token, calendarError: "Expired" };
      return { ...token, ...refreshed, calendarError: undefined };
    },
    async session({ session, token }) {
      // Tokens stay server-side (httpOnly JWT cookie). The browser only learns
      // whether Calendar is connected — never the tokens themselves.
      return {
        ...session,
        calendarConnected: Boolean(token.accessToken) && !token.calendarError,
        calendarError: (token.calendarError as string | undefined) ?? null,
      };
    },
  },
};
