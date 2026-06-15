import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { envSchema } from "@/lib/env";

const VALID_BASE = {
  DATABASE_URL: "postgresql://localhost/test",
  AUTH_SECRET: "placeholder-auth-secret-for-testing-32c",
  GOOGLE_CLIENT_ID: "test-gid",
  GOOGLE_CLIENT_SECRET: "test-gsec",
  GITHUB_CLIENT_ID: "test-ghid",
  GITHUB_CLIENT_SECRET: "test-ghsec",
  RESEND_API_KEY: "re_test",
  RESEND_FROM: "noreply@test.example.com",
  REDIS_URL: "redis://localhost:6379",
  LOG_LEVEL: "info",
  NODE_ENV: "development",
} as const;

describe("envSchema validation", () => {
  it("accepts a fully valid config", () => {
    const result = envSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });

  it("applies default LOG_LEVEL=info when omitted", () => {
    const { LOG_LEVEL, ...rest } = VALID_BASE;
    void LOG_LEVEL;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.LOG_LEVEL).toBe("info");
  });

  it("rejects when a required field is missing", () => {
    const { DATABASE_URL, ...rest } = VALID_BASE;
    void DATABASE_URL;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid RESEND_FROM email", () => {
    const result = envSchema.safeParse({ ...VALID_BASE, RESEND_FROM: "not-an-email" });
    expect(result.success).toBe(false);
  });

  describe("AUTH_URL HTTPS requirement in production", () => {
    beforeEach(() => {
      // Ensure CI env var is unset so the superRefine HTTPS check fires
      vi.stubEnv("CI", "");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("passes when AUTH_URL is HTTPS in production", () => {
      const result = envSchema.safeParse({
        ...VALID_BASE,
        NODE_ENV: "production",
        AUTH_URL: "https://example.com",
      });
      expect(result.success).toBe(true);
    });

    it("fails when AUTH_URL is HTTP in production", () => {
      const result = envSchema.safeParse({
        ...VALID_BASE,
        NODE_ENV: "production",
        AUTH_URL: "http://example.com",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path[0] === "AUTH_URL");
        expect(issue?.message).toContain("HTTPS");
      }
    });

    it("passes when AUTH_URL is omitted in production", () => {
      const result = envSchema.safeParse({ ...VALID_BASE, NODE_ENV: "production" });
      expect(result.success).toBe(true);
    });

    it("passes when AUTH_URL is HTTP in development", () => {
      const result = envSchema.safeParse({
        ...VALID_BASE,
        NODE_ENV: "development",
        AUTH_URL: "http://localhost:3000",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("env module safety gate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("throws when validation fails outside test/CI environments", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GITHUB_ACTIONS", "");
    vi.stubEnv("DATABASE_URL", "");

    await expect(import("@/lib/env")).rejects.toThrow("Invalid environment variables");
  });

  it("does not throw during next build phase and returns safe stub", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", "");

    const mod = await import("@/lib/env");
    expect(mod.env.LOG_LEVEL).toBe("silent");
    expect(mod.env.NODE_ENV).toBe("production");
  });
});
