import { SignJWT, jwtVerify } from "jose";

/**
 * Tokens used by the desktop app to reach the web API.
 *
 * `login` tokens are short-lived and only travel through the browser -> local
 * loopback redirect. The desktop exchanges one (with its PKCE verifier) for a
 * `sync` token, which is stored on the device and sent as a Bearer credential.
 *
 * Both are HS256 with the NextAuth secret so no additional configuration is
 * required; DESKTOP_AUTH_SECRET can override it.
 */
export type DesktopTokenKind = "login" | "sync";

export interface DesktopTokenClaims {
  sub: string;
  kind: DesktopTokenKind;
  email?: string;
  name?: string;
  /** PKCE S256 challenge (login tokens only). */
  challenge?: string;
}

export const LOGIN_TOKEN_TTL_SECONDS = 120;
export const SYNC_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const ISSUER = "tempo-desktop";
const AUDIENCE = "tempo-desktop";

function secretKey(): Uint8Array {
  const secret = process.env.DESKTOP_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Missing DESKTOP_AUTH_SECRET / NEXTAUTH_SECRET");
  return new TextEncoder().encode(secret);
}

export async function signDesktopToken(
  claims: DesktopTokenClaims,
  ttlSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    kind: claims.kind,
    email: claims.email,
    name: claims.name,
    challenge: claims.challenge,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secretKey());
}

export async function verifyDesktopToken(
  token: string,
  kind: DesktopTokenKind
): Promise<DesktopTokenClaims | null> {
  try {
    if (!token || token.length > 4096) return null;
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (payload.kind !== kind || typeof payload.sub !== "string" || !payload.sub) return null;
    return {
      sub: payload.sub,
      kind,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      challenge: typeof payload.challenge === "string" ? payload.challenge : undefined,
    };
  } catch {
    return null;
  }
}
