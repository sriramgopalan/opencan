// @vitest-environment node
// jscpd:ignore-start
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
    AUTH_SECRET: "test-auth-secret-at-least-32-bytes-long-for-tests", // gitleaks:allow
    WIDGET_JWT_SECRET: "widget-secret-for-tests-at-least-32-bytes!", // gitleaks:allow
    WIDGET_ALLOWED_ORIGINS: "https://host.example.com",
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@auth/core/jwt", () => ({
  encode: vi.fn().mockResolvedValue("encoded-session-token"),
}));
vi.mock("@/server/repositories/user", () => ({
  upsertWidgetUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    image: null,
    emailVerified: null,
    createdAt: new Date(),
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { GET } = await import("@/app/api/embed-auth/route");
const { auth } = await import("@/auth");
const { upsertWidgetUser } = await import("@/server/repositories/user");
const { encode } = await import("@auth/core/jwt");
// jscpd:ignore-end

const WIDGET_SECRET = "widget-secret-for-tests-at-least-32-bytes!"; // gitleaks:allow

async function makeToken(payload: Record<string, unknown>, windowSecs = 300): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + windowSecs)
    .sign(Buffer.from(WIDGET_SECRET, "utf-8"));
}

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/embed-auth");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("GET /api/embed-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when next param is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when next param does not start with /embed/", async () => {
    const res = await GET(makeRequest({ next: "/admin/evil" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for path traversal in next param", async () => {
    const res = await GET(makeRequest({ next: "/embed/../admin" }));
    expect(res.status).toBe(400);
  });

  it("redirects to next without session when no token and no secret", async () => {
    // Override env to have no WIDGET_JWT_SECRET
    const { env } = await import("@/lib/env");
    const orig = env.WIDGET_JWT_SECRET;
    (env as Record<string, unknown>)["WIDGET_JWT_SECRET"] = undefined;

    const res = await GET(makeRequest({ next: "/embed/my-board" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/embed/my-board");

    (env as Record<string, unknown>)["WIDGET_JWT_SECRET"] = orig;
  });

  it("redirects (guest) when token is invalid", async () => {
    const res = await GET(makeRequest({ next: "/embed/b", token: "bad.token.here" }));
    expect(res.status).toBe(307);
    expect(upsertWidgetUser).not.toHaveBeenCalled();
  });

  it("redirects with session cookie for valid token", async () => {
    const token = await makeToken({ sub: "user-1", email: "alice@example.com", name: "Alice" });
    const res = await GET(makeRequest({ next: "/embed/my-board", token }));
    expect(res.status).toBe(307);
    expect(upsertWidgetUser).toHaveBeenCalledWith("alice@example.com", "Alice");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("encoded-session-token");
  });

  it("always encodes role as MEMBER regardless of DB user role", async () => {
    const token = await makeToken({ sub: "admin-1", email: "admin@example.com" });
    await GET(makeRequest({ next: "/embed/my-board", token }));
    expect(vi.mocked(encode)).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.objectContaining({ role: "MEMBER" }) }),
    );
  });

  it("skips upsert when caller already has a session", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "existing-user", email: "e@x.com", role: "MEMBER" },
      expires: new Date(Date.now() + 1e6).toISOString(),
    } as never);

    const token = await makeToken({ sub: "u1", email: "a@b.com" });
    const res = await GET(makeRequest({ next: "/embed/b", token }));
    expect(res.status).toBe(307);
    expect(upsertWidgetUser).not.toHaveBeenCalled();
  });
});
