import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { LOGIN_TOKEN_TTL_SECONDS, signDesktopToken } from "@/lib/desktop-auth";

/**
 * Browser leg of the desktop sign-in.
 *
 * The desktop app opens this URL in the system browser with its loopback
 * `redirect_uri`, a random `state` and a PKCE `code_challenge`. After the
 * user signs in (or if they already are), we hand a short-lived login token
 * back to the loopback listener. The desktop then exchanges it for a sync
 * token, proving possession of the PKCE verifier.
 */

const NO_STORE = { "Cache-Control": "no-store" };

function loopbackRedirect(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return null;
  if (!url.port) return null;
  if (url.pathname !== "/callback") return null;
  return url;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const redirect = loopbackRedirect(searchParams.get("redirect_uri"));
  const state = searchParams.get("state") ?? "";
  const challenge = searchParams.get("code_challenge") ?? "";

  if (!redirect) {
    return NextResponse.json(
      { error: "Invalid redirect_uri." },
      { status: 400, headers: NO_STORE }
    );
  }
  // PKCE is mandatory: a login token without a challenge is a bearer token.
  if (!challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return NextResponse.json(
      { error: "Invalid code_challenge." },
      { status: 400, headers: NO_STORE }
    );
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(state)) {
    return NextResponse.json({ error: "Invalid state." }, { status: 400, headers: NO_STORE });
  }

  const user = await getCurrentUser();
  if (!user) {
    // Send the browser through the app's normal Google sign-in, then back
    // here to complete the handoff.
    const here = new URL(req.url);
    const login = new URL("/login", here.origin);
    login.searchParams.set("callbackUrl", `${here.pathname}${here.search}`);
    return NextResponse.redirect(login, { status: 302, headers: NO_STORE });
  }

  const token = await signDesktopToken(
    {
      sub: user.id,
      kind: "login",
      email: user.email,
      challenge,
    },
    LOGIN_TOKEN_TTL_SECONDS
  );

  redirect.searchParams.set("token", token);
  redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect, { status: 302, headers: NO_STORE });
}
