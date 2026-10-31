import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktopCors } from "@/lib/cors";
import {
  SYNC_TOKEN_TTL_SECONDS,
  signDesktopToken,
  verifyDesktopToken,
} from "@/lib/desktop-auth";

/**
 * Desktop leg 2: exchange the short-lived login token (plus the PKCE
 * verifier that never left the app) for a long-lived sync token.
 */

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Buffer.from(digest).toString("base64url");
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: desktopCors(req) });
}

export async function POST(req: Request) {
  const cors = desktopCors(req);

  let body: { token?: unknown; verifier?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: cors });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const verifier = typeof body.verifier === "string" ? body.verifier : "";

  const claims = await verifyDesktopToken(token, "login");
  if (!claims) {
    return NextResponse.json(
      { error: "Sign-in expired. Try again." },
      { status: 401, headers: cors }
    );
  }

  if (claims.challenge) {
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      return NextResponse.json({ error: "Invalid verifier." }, { status: 401, headers: cors });
    }
    const expected = await sha256Base64Url(verifier);
    if (expected !== claims.challenge) {
      return NextResponse.json({ error: "Invalid verifier." }, { status: 401, headers: cors });
    }
  }

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unknown account." }, { status: 401, headers: cors });
  }

  const syncToken = await signDesktopToken(
    { sub: user.id, kind: "sync", email: user.email, name: user.name ?? undefined },
    SYNC_TOKEN_TTL_SECONDS
  );

  return NextResponse.json(
    {
      token: syncToken,
      user: { name: user.name, email: user.email },
      expiresAt: Date.now() + SYNC_TOKEN_TTL_SECONDS * 1000,
    },
    { headers: cors }
  );
}
