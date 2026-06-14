
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

import { prisma } from "@/server/db";

vi.mock("@/server/db");

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { boardRouter } = await import("@/server/routers/board");
const { createCallerFactory } = await import("@/server/trpc");
const { createTestContext, createAuthedContext, createAdminContext } = await import(
  "@/tests/context"
);

const createCaller = createCallerFactory(boardRouter);

// Must match cuid pattern /^[cC][0-9a-z]{6,}$/
const BOARD_ID = "cboard1234567890";
const BOARD_ID2 = "cboard2345678901";
const OWNER_ID = "cowner1234567890";

const DEFAULT_SETTINGS = {
  whoCanPost: "AUTHENTICATED",
  guestVotingEnabled: false,
  postModerationEnabled: false,
};

const BASE_BOARD_ROW = {
  id: BOARD_ID,
  slug: "my-board",
  name: "My Board",
  description: null,
  isPublic: true,
  isListed: true,
  settingsJson: DEFAULT_SETTINGS,
  createdAt: new Date("2024-01-01"),
  ownerId: OWNER_ID,
  position: 0,
  updatedAt: new Date("2024-01-01"),
};


describe("boardRouter", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  // ---------------------------------------------------------------------------
  // boards.create
  // ---------------------------------------------------------------------------

  describe("boards.create", () => {
    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(createTestContext());
      await expect(
        caller.create({ name: "Test", isPublic: false, isListed: false }),
      ).rejects.toThrow(TRPCError);
    });

    it("rejects non-admin users", async () => {
      const caller = createCaller(createAuthedContext("user-1"));
      await expect(
        caller.create({ name: "Test", isPublic: false, isListed: false }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("creates board with auto-generated slug", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null); // slug available
      prismaMock.board.aggregate.mockResolvedValue({ _max: { position: null } } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.board.create.mockResolvedValue(BASE_BOARD_ROW as never);
      const caller = createCaller(createAdminContext("admin-1"));
      const result = await caller.create({ name: "My Board", isPublic: true, isListed: true });
      expect(result.slug).toBe("my-board");
    });

    it("creates board with explicit slug", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null); // slug available
      prismaMock.board.aggregate.mockResolvedValue({ _max: { position: null } } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.board.create.mockResolvedValue(BASE_BOARD_ROW as never);
      const caller = createCaller(createAdminContext("admin-1"));
      const result = await caller.create({
        name: "My Board",
        slug: "my-board",
        isPublic: false,
        isListed: false,
      });
      expect(result.slug).toBe("my-board");
    });

    it("rejects reserved slug", async () => {
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.create({ name: "Admin", slug: "admin", isPublic: false, isListed: false }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects invalid slug format", async () => {
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.create({ name: "Test", slug: "BAD_SLUG!", isPublic: false, isListed: false }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects isListed=true when isPublic=false", async () => {
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.create({ name: "Test", isPublic: false, isListed: true }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects taken explicit slug", async () => {
      prismaMock.board.findUnique.mockResolvedValue({ id: "other" } as never);
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.create({ name: "Test", slug: "my-board", isPublic: false, isListed: false }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  // ---------------------------------------------------------------------------
  // boards.getBySlug
  // ---------------------------------------------------------------------------

  describe("boards.getBySlug", () => {
    it("returns public board to unauthenticated caller", async () => {
      prismaMock.board.findFirst.mockResolvedValue(BASE_BOARD_ROW as never);
      const caller = createCaller(createTestContext());
      const result = await caller.getBySlug({ slug: "my-board" });
      expect(result.slug).toBe("my-board");
      expect(result).not.toHaveProperty("ownerId");
    });

    it("throws NOT_FOUND for private board when not admin", async () => {
      prismaMock.board.findFirst.mockResolvedValue(null);
      const caller = createCaller(createTestContext());
      await expect(caller.getBySlug({ slug: "private" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns admin board with _count to admin", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD_ROW as never);
      const caller = createCaller(createAdminContext("admin-1"));
      const result = await caller.getBySlug({ slug: "my-board" });
      expect(result).toHaveProperty("ownerId");
      expect(result).toHaveProperty("_count");
    });

    it("normalises slug to lowercase", async () => {
      prismaMock.board.findFirst.mockResolvedValue(BASE_BOARD_ROW as never);
      const caller = createCaller(createTestContext());
      await caller.getBySlug({ slug: "MY-BOARD" });
      expect(prismaMock.board.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ slug: "my-board" }) }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // boards.list
  // ---------------------------------------------------------------------------

  describe("boards.list", () => {
    it("returns only public boards for unauthenticated callers", async () => {
      prismaMock.board.findMany.mockResolvedValue([BASE_BOARD_ROW] as never);
      prismaMock.board.count.mockResolvedValue(1);
      const caller = createCaller(createTestContext());
      await caller.list();
      expect(prismaMock.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isPublic: true }) }),
      );
    });

    it("returns all boards for admin", async () => {
      prismaMock.board.findMany.mockResolvedValue([BASE_BOARD_ROW] as never);
      prismaMock.board.count.mockResolvedValue(1);
      const caller = createCaller(createAdminContext("admin-1"));
      await caller.list();
      const call = prismaMock.board.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.isPublic).toBeUndefined();
    });

    it("returns pagination metadata", async () => {
      prismaMock.board.findMany.mockResolvedValue([]);
      prismaMock.board.count.mockResolvedValue(0);
      const caller = createCaller(createTestContext());
      const result = await caller.list({ page: 1, limit: 10, orderBy: "createdAt", order: "desc" });
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("totalPages");
    });
  });

  // ---------------------------------------------------------------------------
  // boards.update
  // ---------------------------------------------------------------------------

  describe("boards.update", () => {
    it("rejects non-admin", async () => {
      const caller = createCaller(createAuthedContext("user-1"));
      await expect(caller.update({ id: BOARD_ID, name: "New" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("throws NOT_FOUND when board does not exist", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(caller.update({ id: BOARD_ID, name: "New" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("rejects making board listed without public", async () => {
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_BOARD_ROW,
        isPublic: false,
        isListed: false,
      } as never);
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.update({ id: BOARD_ID, isListed: true }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("updates board successfully", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD_ROW as never);
      prismaMock.board.update.mockResolvedValue({ ...BASE_BOARD_ROW, name: "Renamed" } as never);
      const caller = createCaller(createAdminContext("admin-1"));
      const result = await caller.update({ id: BOARD_ID, name: "Renamed" });
      expect(result.name).toBe("Renamed");
    });
  });

  // ---------------------------------------------------------------------------
  // boards.updateSettings
  // ---------------------------------------------------------------------------

  describe("boards.updateSettings", () => {
    it("rejects non-admin", async () => {
      const caller = createCaller(createAuthedContext("user-1"));
      await expect(
        caller.updateSettings({ id: BOARD_ID, settings: { whoCanPost: "ANYONE" } }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND when board missing", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.updateSettings({ id: BOARD_ID, settings: { whoCanPost: "ANYONE" } }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("updates settings successfully", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD_ROW as never); // getBoardById
      prismaMock.board.findUniqueOrThrow.mockResolvedValue(BASE_BOARD_ROW as never); // updateBoard settings fetch
      prismaMock.board.update.mockResolvedValue({
        ...BASE_BOARD_ROW,
        settingsJson: { ...DEFAULT_SETTINGS, whoCanPost: "ANYONE" },
      } as never);
      const caller = createCaller(createAdminContext("admin-1"));
      const result = await caller.updateSettings({
        id: BOARD_ID,
        settings: { whoCanPost: "ANYONE" },
      });
      expect(result.settings.whoCanPost).toBe("ANYONE");
    });
  });

  // ---------------------------------------------------------------------------
  // boards.delete
  // ---------------------------------------------------------------------------

  describe("boards.delete", () => {
    it("rejects non-admin", async () => {
      const caller = createCaller(createAuthedContext("user-1"));
      await expect(
        caller.delete({ id: BOARD_ID, confirmSlug: "my-board" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND when board missing", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.delete({ id: BOARD_ID, confirmSlug: "my-board" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects when confirmSlug does not match", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD_ROW as never);
      const caller = createCaller(createAdminContext("admin-1"));
      await expect(
        caller.delete({ id: BOARD_ID, confirmSlug: "wrong-slug" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("deletes board when slug matches", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD_ROW as never);
      prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          board: {
            delete: vi.fn().mockResolvedValue({ id: BOARD_ID, slug: "my-board" }),
          },
        };
        return fn(txMock);
      }) as never);
      const caller = createCaller(createAdminContext("admin-1"));
      const result = await caller.delete({ id: BOARD_ID, confirmSlug: "my-board" });
      expect(result.id).toBe(BOARD_ID);
      expect(result).toHaveProperty("deletedAt");
    });
  });

  // ---------------------------------------------------------------------------
  // boards.reorder
  // ---------------------------------------------------------------------------

  describe("boards.reorder", () => {
    it("rejects non-admin", async () => {
      const caller = createCaller(createAuthedContext("user-1"));
      await expect(
        caller.reorder({ updates: [{ id: BOARD_ID, position: 0 }] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("calls reorderBoards and returns count", async () => {
      prismaMock.board.update.mockResolvedValue(BASE_BOARD_ROW as never);
      prismaMock.$transaction.mockResolvedValue([] as never);
      const caller = createCaller(createAdminContext("admin-1"));
      const result = await caller.reorder({
        updates: [
          { id: BOARD_ID, position: 0 },
          { id: BOARD_ID2, position: 1 },
        ],
      });
      expect(result).toEqual({ updated: 2 });
    });
  });
});
