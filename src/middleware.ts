import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Personal data routes require Google sign-in. Unauthenticated users go to /login.
// The timer + dashboard summary (/) stay open so local offline use keeps working.
export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/tasks/:path*", "/plan", "/history/:path*", "/review", "/settings/:path*"],
};
