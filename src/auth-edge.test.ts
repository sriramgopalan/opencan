// @vitest-environment node
import { encode } from "@auth/core/jwt";
import { describe, expect, it } from "vitest";

import { getSessionFromJWT } from "@/auth-edge";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

// auth-edge.ts re-implements Auth.js's JWE key derivation so middleware can read
// the session cookie without a DB/Redis hit. These tests encode with the real
// Auth.js `encode` so a dependency upgrade that changes the token format fails here.

const SECRET = process.env["AUTH_SECRET"] ?? "";

async function encodeSession(token: Record<string, unknown>, secret = SECRET): Promise<string> {
  return encode({ token, secret, salt: AUTH_COOKIE_NAME, maxAge: 60 });
}

describe("getSessionFromJWT", () => {
  it("decodes a session token issued by Auth.js", async () => {
    const jwt = await encodeSession({ sub: "user-1", role: "ADMIN", email: "a@example.com" });

    const session = await getSessionFromJWT(jwt);

    expect(session).toEqual({ id: "user-1", role: "ADMIN", email: "a@example.com" });
  });

  it("falls back to id, MEMBER role, and empty email when claims are absent", async () => {
    const jwt = await encodeSession({ id: "user-2" });

    const session = await getSessionFromJWT(jwt);

    expect(session).toEqual({ id: "user-2", role: "MEMBER", email: "" });
  });

  it("returns null for a token signed with a different secret", async () => {
    const jwt = await encodeSession({ sub: "user-1" }, "a-completely-different-secret-value");

    expect(await getSessionFromJWT(jwt)).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    expect(await getSessionFromJWT("not-a-jwt")).toBeNull();
  });

  // Fail-closed guard: HKDF rejects an empty key, so key derivation throws and the
  // catch returns null. Locks that in against a future "?? default" style change.
  it("rejects even a validly signed token when AUTH_SECRET is unset", async () => {
    const jwt = await encodeSession({ sub: "user-1", role: "ADMIN" });
    const original = process.env["AUTH_SECRET"];
    delete process.env["AUTH_SECRET"];

    try {
      expect(await getSessionFromJWT(jwt)).toBeNull();
    } finally {
      process.env["AUTH_SECRET"] = original;
    }
  });
});
