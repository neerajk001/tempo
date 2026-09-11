export {};

declare module "next-auth" {
  interface Session {
    calendarConnected?: boolean;
    calendarError?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    calendarError?: string;
  }
}
