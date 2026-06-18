import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db";
import { mockReset, type DeepMockProxy, type PrismaClient } from "@/tests/helpers/repository-setup";

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
  getSuspendedAt,
  getUserRoleAndStatus,
  adminDeleteUser,
  setUserRole,
  suspendUser,
  unsuspendUser,
  deleteUserAccount,
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
    it("returns password hash fields including suspendedAt", async () => {
      const row = {
        id: "user-1",
        passwordHash: "hashed",
        failedLoginCount: 0,
        lockedUntil: null,
        suspendedAt: null,
        role: "MEMBER",
      };
      prismaMock.user.findUnique.mockResolvedValue(row as never);
      const result = await getUserWithPasswordHash("test@example.com");
      expect(result?.passwordHash).toBe("hashed");
      expect(result?.failedLoginCount).toBe(0);
      expect(result?.suspendedAt).toBeNull();
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

  describe("getSuspendedAt", () => {
    it("returns suspendedAt when user is suspended", async () => {
      const suspendedAt = new Date("2026-01-01");
      prismaMock.user.findUnique.mockResolvedValue({ suspendedAt } as never);
      expect(await getSuspendedAt("test@example.com")).toEqual(suspendedAt);
    });

    it("returns null when user is not suspended", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ suspendedAt: null } as never);
      expect(await getSuspendedAt("test@example.com")).toBeNull();
    });

    it("returns null when user is not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      expect(await getSuspendedAt("nobody@example.com")).toBeNull();
    });
  });

  describe("getUserRoleAndStatus", () => {
    it("returns role and status fields", async () => {
      const row = { id: "user-1", email: "test@example.com", role: "MEMBER", suspendedAt: null };
      prismaMock.user.findUnique.mockResolvedValue(row as never);
      expect(await getUserRoleAndStatus("user-1")).toEqual(row);
    });

    it("returns null when not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      expect(await getUserRoleAndStatus("missing")).toBeNull();
    });
  });

  describe("setUserRole", () => {
    it("updates role and returns id and role", async () => {
      prismaMock.user.update.mockResolvedValue({ id: "user-1", role: "ADMIN" } as never);
      const result = await setUserRole("user-1", "ADMIN");
      expect(result.role).toBe("ADMIN");
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: "ADMIN" } }),
      );
    });
  });

  describe("suspendUser", () => {
    it("sets suspendedAt to current time", async () => {
      const now = new Date();
      prismaMock.user.update.mockResolvedValue({ id: "user-1", suspendedAt: now } as never);
      const result = await suspendUser("user-1");
      expect(result.suspendedAt).toBeInstanceOf(Date);
    });
  });

  describe("unsuspendUser", () => {
    it("clears suspendedAt", async () => {
      prismaMock.user.update.mockResolvedValue({ id: "user-1", suspendedAt: null } as never);
      const result = await unsuspendUser("user-1");
      expect(result.suspendedAt).toBeNull();
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { suspendedAt: null } }),
      );
    });
  });

  describe("deleteUserAccount", () => {
    it("runs transaction then anonymises user", async () => {
      prismaMock.$transaction.mockResolvedValue([]);
      prismaMock.user.update.mockResolvedValue({} as never);
      await deleteUserAccount("user-1", "test@example.com");
      expect(prismaMock.$transaction).toHaveBeenCalledOnce();
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-1" },
          data: expect.objectContaining({ email: expect.stringMatching(/^deleted-/) }),
        }),
      );
    });
  });

  describe("adminDeleteUser", () => {
    it("tombstones comments, nulls post authors, deletes votes, then hard-deletes user", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === "function") await fn(prismaMock);
        return [];
      });
      prismaMock.comment.updateMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.post.updateMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.vote.deleteMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.user.delete.mockResolvedValue({} as never);

      await adminDeleteUser("user-1");

      expect(prismaMock.comment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: "user-1" },
          data: { authorId: null, body: "[deleted]" },
        }),
      );
      expect(prismaMock.post.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: "user-1" },
          data: { authorId: null },
        }),
      );
      expect(prismaMock.vote.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    });
  });
});
