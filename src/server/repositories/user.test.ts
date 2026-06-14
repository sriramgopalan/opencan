
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

import { prisma } from "@/server/db";

vi.mock("@/server/db");

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const {
  getUserById,
  getUserByEmail,
  getUserWithPasswordHash,
  createUser,
  markEmailVerified,
  incrementFailedLoginCount,
  lockAccount,
  resetFailedLoginCount,
  anonymiseUser,
  getProviderForEmail,
} = await import("@/server/repositories/user");

const SAFE_USER = {
  id: "user-1",
  email: "test@example.com",
  emailVerified: null,
  name: null,
  image: null,
  createdAt: new Date(),
};

describe("user repository", () => {
  afterEach(() => {
    mockReset(prismaMock);
  });

  describe("getUserById", () => {
    it("returns user when found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(SAFE_USER as never);
      const result = await getUserById("user-1");
      expect(result).toEqual(SAFE_USER);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        select: expect.objectContaining({ id: true, email: true }),
      });
    });

    it("returns null when not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      expect(await getUserById("missing")).toBeNull();
    });
  });

  describe("getUserByEmail", () => {
    it("returns user when found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(SAFE_USER as never);
      const result = await getUserByEmail("test@example.com");
      expect(result).toEqual(SAFE_USER);
    });

    it("returns null when not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      expect(await getUserByEmail("nobody@example.com")).toBeNull();
    });
  });

  describe("getUserWithPasswordHash", () => {
    it("returns password hash fields", async () => {
      const row = {
        id: "user-1",
        passwordHash: "hashed",
        failedLoginCount: 0,
        lockedUntil: null,
      };
      prismaMock.user.findUnique.mockResolvedValue(row as never);
      const result = await getUserWithPasswordHash("test@example.com");
      expect(result?.passwordHash).toBe("hashed");
      expect(result?.failedLoginCount).toBe(0);
    });
  });

  describe("createUser", () => {
    it("creates user and returns safe fields", async () => {
      prismaMock.user.create.mockResolvedValue(SAFE_USER as never);
      const result = await createUser({ email: "test@example.com", passwordHash: "hashed" });
      expect(result.email).toBe("test@example.com");
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "test@example.com" }),
        }),
      );
    });
  });

  describe("markEmailVerified", () => {
    it("updates emailVerified timestamp", async () => {
      prismaMock.user.update.mockResolvedValue({} as never);
      await markEmailVerified("user-1");
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { emailVerified: expect.any(Date) },
      });
    });
  });

  describe("incrementFailedLoginCount", () => {
    it("returns new count", async () => {
      prismaMock.user.update.mockResolvedValue({ failedLoginCount: 3 } as never);
      expect(await incrementFailedLoginCount("user-1")).toBe(3);
    });
  });

  describe("lockAccount", () => {
    it("sets lockedUntil", async () => {
      prismaMock.user.update.mockResolvedValue({} as never);
      const until = new Date();
      await lockAccount("user-1", until);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { lockedUntil: until },
      });
    });
  });

  describe("resetFailedLoginCount", () => {
    it("resets count and clears lockout", async () => {
      prismaMock.user.update.mockResolvedValue({} as never);
      await resetFailedLoginCount("user-1");
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  });

  describe("anonymiseUser", () => {
    it("replaces PII with anonymised values", async () => {
      prismaMock.user.update.mockResolvedValue({} as never);
      await anonymiseUser("user-1");
      const call = prismaMock.user.update.mock.calls[0];
      expect(call?.[0]?.data?.email).toMatch(/^deleted-.*@deleted\.etash\.com$/);
      expect(call?.[0]?.data?.name).toBeNull();
      expect(call?.[0]?.data?.passwordHash).toBeNull();
    });
  });

  describe("getProviderForEmail", () => {
    it("returns provider when account exists", async () => {
      prismaMock.account.findFirst.mockResolvedValue({ provider: "google" } as never);
      expect(await getProviderForEmail("test@example.com")).toBe("google");
    });

    it("returns null when no account", async () => {
      prismaMock.account.findFirst.mockResolvedValue(null);
      expect(await getProviderForEmail("test@example.com")).toBeNull();
    });
  });
});
