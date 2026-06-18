
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeepMockProxy } from "vitest-mock-extended";
import { mockReset } from "vitest-mock-extended";

import { env } from "@/lib/env";
import { makeFullRedisMock } from "@/tests/helpers/auth-setup";

let prismaMock: DeepMockProxy<PrismaClient>;

const { redisMock, pipelineMock } = makeFullRedisMock();

vi.mock("@/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  prismaMock = mockDeep<PrismaClient>();
  return { prisma: prismaMock };
});

vi.mock("@/lib/redis", () => ({ redis: redisMock }));
vi.mock("@node-rs/argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password"),
  verify: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletedEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const loggerErrorMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: loggerErrorMock, info: vi.fn() },
}));

const { authRouter } = await import("@/server/routers/auth");
const { createCallerFactory } = await import("@/server/trpc");
const { verify } = await import("@node-rs/argon2");
const { sendMagicLinkEmail, sendPasswordChangedEmail, sendAccountDeletedEmail, sendVerificationEmail } =
  await import("@/lib/email");

const createCaller = createCallerFactory(authRouter);

const SAFE_USER = {
  id: "user-1",
  email: "user@example.com",
  emailVerified: null,
  name: null,
  image: null,
  createdAt: new Date(),
};

function makeSession(userId = "user-1", email: string | null = "user@example.com", role = "MEMBER") {
  return {
    user: { id: userId, email, name: null, image: null, role },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe("authRouter", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
    // Default: rate limit passes
    pipelineMock.exec.mockResolvedValue([[null, 1], [null, 1]]);
  });

  describe("requestMagicLink", () => {
    it("creates token and returns sent=true for existing user", async () => {
      prismaMock.user.findUnique.mockResolvedValue(SAFE_USER as never);
      prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationToken.create.mockResolvedValue({} as never);

      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      const result = await caller.requestMagicLink({ email: "user@example.com" });

      expect(result).toEqual({ sent: true });
      expect(prismaMock.verificationToken.create).toHaveBeenCalled();
    });

    it("auto-registers new user when email not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(SAFE_USER as never);
      prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationToken.create.mockResolvedValue({} as never);

      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      const result = await caller.requestMagicLink({ email: "new@example.com" });

      expect(result.sent).toBe(true);
      expect(prismaMock.user.create).toHaveBeenCalled();
    });

    it("rejects invalid email", async () => {
      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      await expect(caller.requestMagicLink({ email: "not-an-email" })).rejects.toBeInstanceOf(
        TRPCError,
      );
    });

    it("throws when rate limited", async () => {
      pipelineMock.exec.mockResolvedValue([[null, 11], [null, 1]]);

      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      await expect(
        caller.requestMagicLink({ email: "user@example.com" }),
      ).rejects.toBeInstanceOf(TRPCError);
    });

    it("logs error and still returns sent=true when magic link email fails", async () => {
      prismaMock.user.findUnique.mockResolvedValue(SAFE_USER as never);
      prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationToken.create.mockResolvedValue({} as never);
      vi.mocked(sendMagicLinkEmail).mockRejectedValueOnce(new Error("smtp error"));

      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      const result = await caller.requestMagicLink({ email: "user@example.com" });

      expect(result).toEqual({ sent: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "magic link email failed",
      );
    });

    it("falls back to localhost base URL when AUTH_URL is not configured", async () => {
      const originalAuthUrl = env.AUTH_URL;
      env.AUTH_URL = undefined;
      try {
        prismaMock.user.findUnique.mockResolvedValue(SAFE_USER as never);
        prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
        prismaMock.verificationToken.create.mockResolvedValue({} as never);

        const caller = createCaller({ session: null, ip: "127.0.0.1" });
        const result = await caller.requestMagicLink({ email: "user@example.com" });

        expect(result).toEqual({ sent: true });
        expect(vi.mocked(sendMagicLinkEmail)).toHaveBeenCalledWith(
          "user@example.com",
          expect.stringContaining("http://localhost:3000"),
        );
      } finally {
        env.AUTH_URL = originalAuthUrl;
      }
    });
  });

  function setupChangePasswordMocks(activeSessionCount = 0) {
    vi.mocked(verify).mockResolvedValue(true);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: "old-hash",
      failedLoginCount: 0,
      lockedUntil: null,
    } as never);
    prismaMock.session.findMany.mockResolvedValue(
      (activeSessionCount > 0 ? [{ sessionToken: "tok-1" }] : []) as never,
    );
    redisMock.smembers.mockResolvedValue(activeSessionCount > 0 ? ["tok-1"] : []);
    redisMock.del.mockResolvedValue(activeSessionCount);
    prismaMock.$transaction.mockResolvedValue([{ count: activeSessionCount }, {}] as never);
  }

  describe("changePassword", () => {
    it("changes password and invalidates sessions", async () => {
      setupChangePasswordMocks(1);

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      const result = await caller.changePassword({
        currentPassword: "old-password-123",
        newPassword: "new-password-456789",
      });

      expect(result).toEqual({ success: true });
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it("throws BAD_REQUEST when user has no password set (OAuth account)", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: null,
        failedLoginCount: 0,
        lockedUntil: null,
      } as never);

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      await expect(
        caller.changePassword({ currentPassword: "old", newPassword: "new-password-456789" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("throws when current password is wrong", async () => {
      vi.mocked(verify).mockResolvedValue(false);
      prismaMock.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: "old-hash",
        failedLoginCount: 0,
        lockedUntil: null,
      } as never);

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      await expect(
        caller.changePassword({
          currentPassword: "wrong",
          newPassword: "new-password-456789",
        }),
      ).rejects.toBeInstanceOf(TRPCError);
    });

    it("rejects unauthenticated calls", async () => {
      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      await expect(
        caller.changePassword({
          currentPassword: "old",
          newPassword: "new-password-456789",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects new password under 12 chars", async () => {
      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      await expect(
        caller.changePassword({ currentPassword: "old", newPassword: "short" }),
      ).rejects.toBeInstanceOf(TRPCError);
    });

    it("logs error and still succeeds when password-changed email fails", async () => {
      setupChangePasswordMocks();
      vi.mocked(sendPasswordChangedEmail).mockRejectedValueOnce(new Error("smtp error"));

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      const result = await caller.changePassword({
        currentPassword: "old-password-123",
        newPassword: "new-password-456789",
      });

      expect(result).toEqual({ success: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "password changed email failed",
      );
    });

    it("falls back to an empty string when session has no email", async () => {
      setupChangePasswordMocks();

      const caller = createCaller({ session: makeSession("user-1", null), ip: "127.0.0.1" });
      const result = await caller.changePassword({
        currentPassword: "old-password-123",
        newPassword: "new-password-456789",
      });

      expect(result).toEqual({ success: true });
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: "" } }),
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(vi.mocked(sendPasswordChangedEmail)).toHaveBeenCalledWith("");
    });
  });

  function setupDeleteAccountMocks() {
    redisMock.smembers.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue([
      { count: 1 },
      { count: 0 },
      { count: 0 },
      { count: 0 },
      { count: 0 },
      { count: 0 },
    ] as never);
    prismaMock.vote.deleteMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
  }

  describe("deleteAccount", () => {
    it("anonymises user and clears sessions", async () => {
      setupDeleteAccountMocks();

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      const result = await caller.deleteAccount({ confirmation: "delete my account" });

      expect(result).toEqual({ success: true });
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.user.update).toHaveBeenCalled();
    });

    it("deletes user votes in the same transaction as session cleanup", async () => {
      setupDeleteAccountMocks();

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      await caller.deleteAccount({ confirmation: "delete my account" });

      expect(prismaMock.vote.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    });

    it("rejects wrong confirmation string", async () => {
      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      await expect(
        // @ts-expect-error testing wrong literal
        caller.deleteAccount({ confirmation: "wrong" }),
      ).rejects.toBeInstanceOf(TRPCError);
    });

    it("rejects unauthenticated calls", async () => {
      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      await expect(
        caller.deleteAccount({ confirmation: "delete my account" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("logs error and still succeeds when account-deleted email fails", async () => {
      setupDeleteAccountMocks();
      vi.mocked(sendAccountDeletedEmail).mockRejectedValueOnce(new Error("smtp error"));

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      const result = await caller.deleteAccount({ confirmation: "delete my account" });

      expect(result).toEqual({ success: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "account deleted email failed",
      );
    });

    it("falls back to an empty string when session has no email", async () => {
      setupDeleteAccountMocks();

      const caller = createCaller({ session: makeSession("user-1", null), ip: "127.0.0.1" });
      const result = await caller.deleteAccount({ confirmation: "delete my account" });

      expect(result).toEqual({ success: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(vi.mocked(sendAccountDeletedEmail)).toHaveBeenCalledWith("");
    });
  });

  describe("resendVerification", () => {
    it("creates verification token and returns sent=true", async () => {
      prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationToken.create.mockResolvedValue({} as never);

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      const result = await caller.resendVerification({});

      expect(result).toEqual({ sent: true });
      expect(prismaMock.verificationToken.create).toHaveBeenCalled();
    });

    it("rejects unauthenticated calls", async () => {
      const caller = createCaller({ session: null, ip: "127.0.0.1" });
      await expect(caller.resendVerification({})).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("logs error and still returns sent=true when verification email fails", async () => {
      prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationToken.create.mockResolvedValue({} as never);
      vi.mocked(sendVerificationEmail).mockRejectedValueOnce(new Error("smtp error"));

      const caller = createCaller({ session: makeSession(), ip: "127.0.0.1" });
      const result = await caller.resendVerification({});

      expect(result).toEqual({ sent: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "verification email failed",
      );
    });

    it("falls back to an empty string when session has no email", async () => {
      prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationToken.create.mockResolvedValue({} as never);

      const caller = createCaller({ session: makeSession("user-1", null), ip: "127.0.0.1" });
      const result = await caller.resendVerification({});

      expect(result).toEqual({ sent: true });
      expect(vi.mocked(sendVerificationEmail)).toHaveBeenCalledWith("", expect.any(String));
    });
  });
});
