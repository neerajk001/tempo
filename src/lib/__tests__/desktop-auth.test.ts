import { describe, expect, it } from "vitest";
import { signDesktopToken, verifyDesktopToken } from "@/lib/desktop-auth";

process.env.DESKTOP_AUTH_SECRET = "test-secret-test-secret-test-secret";

describe("desktop tokens", () => {
  it("round-trips a sync token", async () => {
    const token = await signDesktopToken(
      { sub: "user-1", kind: "sync", email: "a@example.com" },
      60
    );
    const claims = await verifyDesktopToken(token, "sync");
    expect(claims).toMatchObject({ sub: "user-1", kind: "sync", email: "a@example.com" });
  });

  it("scopes tokens to their kind", async () => {
    const login = await signDesktopToken({ sub: "user-1", kind: "login" }, 60);
    expect(await verifyDesktopToken(login, "sync")).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await signDesktopToken({ sub: "user-1", kind: "sync" }, -1);
    expect(await verifyDesktopToken(token, "sync")).toBeNull();
  });

  it("rejects tampered tokens", async () => {
    const token = await signDesktopToken({ sub: "user-1", kind: "sync" }, 60);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifyDesktopToken(tampered, "sync")).toBeNull();
  });
});
