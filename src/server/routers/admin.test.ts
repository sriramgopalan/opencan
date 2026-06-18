import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

import { prisma } from "@/server/db";

vi.mock("@/server/db");
vi.mock("@/lib/session-blocklist");
vi.mock("@/server/repositories/session");

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { adminRouter } = await import("@/server/routers/admin");
const { createCallerFactory } = await import("@/server/trpc");
const { createTestContext, createAuthedContext, createAdminContext } = await import(
  "@/tests/context"
);
const { addToBlocklist } = await import("@/lib/session-blocklist");
const addToBlocklistMock = addToBlocklist as ReturnType<typeof vi.fn>;

const createCaller = createCallerFactory(adminRouter);

const ADMIN_ID = "cadmin1234567890";
const USER_ID = "cuser12345678901";

const MEMBER_USER = {
  id: USER_ID,
  email: "user@example.com",
  role: "MEMBER",
  suspendedAt: null,
} as const;

describe("adminRouter", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // admin.getStats
  // ---------------------------------------------------------------------------

  describe("getStats", () => {
    it("rejects non-admin callers", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.getStats()).rejects.toThrow(TRPCError);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(createTestContext());
      await expect(caller.getStats()).rejects.toThrow(TRPCError);
    });

    it("returns workspace statistics for admin", async () => {
      prismaMock.board.count.mockResolvedValue(2);
      prismaMock.post.count.mockResolvedValue(5);
      prismaMock.post.aggregate.mockResolvedValue({ _sum: { voteCount: 10 } } as never);
      prismaMock.comment.count.mockResolvedValue(15);
      prismaMock.user.count.mockResolvedValue(8);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const stats = await caller.getStats();

      expect(stats.totalBoards).toBe(2);
      expect(stats.totalPosts).toBe(5);
      expect(stats.totalVotes).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // admin.listUsers
  // ---------------------------------------------------------------------------

  describe("listUsers", () => {
    it("rejects non-admin callers", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.listUsers({ page: 1, limit: 20 })).rejects.toThrow(TRPCError);
    });

    it("returns user list with totalPages for admin", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.listUsers({ page: 1, limit: 20 });
      expect(result.users).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("computes totalPages correctly", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(45);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.listUsers({ page: 1, limit: 20 });
      expect(result.totalPages).toBe(3);
    });

    it("strips whitespace from search input", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      // Should not throw — .trim() is applied by Zod
      await expect(caller.listUsers({ page: 1, limit: 20, search: "  alice  " })).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // admin.updateUserRole
  // ---------------------------------------------------------------------------

  describe("updateUserRole", () => {
    it("rejects non-admin callers", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.updateUserRole({ userId: USER_ID, role: "ADMIN" }),
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN when targeting self", async () => {
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.updateUserRole({ userId: ADMIN_ID, role: "MEMBER" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND when user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.updateUserRole({ userId: USER_ID, role: "ADMIN" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("no-op: returns current state without DB write when role unchanged", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER_USER } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.updateUserRole({ userId: USER_ID, role: "MEMBER" });
      expect(result.role).toBe("MEMBER");
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(addToBlocklistMock).not.toHaveBeenCalled();
    });

    it("updates role and adds user to blocklist when role changes", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER_USER } as never);
      prismaMock.user.update.mockResolvedValue({ id: USER_ID, role: "ADMIN" } as never);
      addToBlocklistMock.mockResolvedValue(undefined);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.updateUserRole({ userId: USER_ID, role: "ADMIN" });

      expect(result.role).toBe("ADMIN");
      expect(addToBlocklistMock).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // admin.suspendUser
  // ---------------------------------------------------------------------------

  describe("suspendUser", () => {
    it("throws FORBIDDEN when targeting self", async () => {
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.suspendUser({ userId: ADMIN_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("throws NOT_FOUND when user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.suspendUser({ userId: USER_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("throws FORBIDDEN when targeting another admin", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...MEMBER_USER,
        role: "ADMIN",
      } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.suspendUser({ userId: USER_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("no-op: returns current state without DB write when already suspended", async () => {
      const alreadySuspended = new Date("2026-01-01");
      prismaMock.user.findUnique.mockResolvedValue({
        ...MEMBER_USER,
        suspendedAt: alreadySuspended,
      } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.suspendUser({ userId: USER_ID });
      expect(result.suspendedAt).toEqual(alreadySuspended);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(addToBlocklistMock).not.toHaveBeenCalled();
    });

    it("suspends user and adds to blocklist", async () => {
      const now = new Date();
      prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER_USER } as never);
      prismaMock.user.update.mockResolvedValue({ id: USER_ID, suspendedAt: now } as never);
      addToBlocklistMock.mockResolvedValue(undefined);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.suspendUser({ userId: USER_ID });

      expect(result.suspendedAt).toBeInstanceOf(Date);
      expect(addToBlocklistMock).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // admin.unsuspendUser
  // ---------------------------------------------------------------------------

  describe("unsuspendUser", () => {
    it("no-op: returns null suspendedAt without DB write when not suspended", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER_USER } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.unsuspendUser({ userId: USER_ID });
      expect(result.suspendedAt).toBeNull();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(addToBlocklistMock).not.toHaveBeenCalled();
    });

    it("clears suspension without adding to blocklist", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...MEMBER_USER,
        suspendedAt: new Date(),
      } as never);
      prismaMock.user.update.mockResolvedValue({ id: USER_ID, suspendedAt: null } as never);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.unsuspendUser({ userId: USER_ID });

      expect(result.suspendedAt).toBeNull();
      expect(addToBlocklistMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // admin.deleteUser
  // ---------------------------------------------------------------------------

  describe("deleteUser", () => {
    it("throws FORBIDDEN when targeting self", async () => {
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.deleteUser({ userId: ADMIN_ID, confirmEmail: "admin@example.com" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws FORBIDDEN when targeting another admin", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...MEMBER_USER,
        role: "ADMIN",
        email: "other-admin@example.com",
      } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.deleteUser({ userId: USER_ID, confirmEmail: "other-admin@example.com" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws BAD_REQUEST when confirmEmail does not match", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER_USER } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.deleteUser({ userId: USER_ID, confirmEmail: "wrong@example.com" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("deletes user account and returns { id } after blocklisting", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER_USER } as never);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        if (typeof fn === "function") await fn(prismaMock);
        return [];
      });
      prismaMock.comment.updateMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.post.updateMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.vote.deleteMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.user.delete.mockResolvedValue({} as never);
      addToBlocklistMock.mockResolvedValue(undefined);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.deleteUser({
        userId: USER_ID,
        confirmEmail: "user@example.com",
      });

      expect(result).toEqual({ id: USER_ID });
      expect(addToBlocklistMock).toHaveBeenCalledWith(USER_ID);
      expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    });
  });
});
