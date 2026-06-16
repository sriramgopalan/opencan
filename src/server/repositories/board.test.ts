
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db";
import { mockReset, type DeepMockProxy, type PrismaClient } from "@/tests/helpers/repository-setup";

vi.mock("@/server/db");

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const {
  checkSlugAvailable,
  createBoard,
  getBoardBySlug,
  getBoardBySlugAdmin,
  getBoardById,
  updateBoard,
  deleteBoard,
  listBoards,
  reorderBoards,
} = await import("@/server/repositories/board");

const DEFAULT_SETTINGS = {
  whoCanPost: "AUTHENTICATED",
  guestVotingEnabled: false,
  postModerationEnabled: false,
};

const BASE_ROW = {
  id: "board-1",
  slug: "my-board",
  name: "My Board",
  description: null,
  isPublic: true,
  isListed: true,
  settingsJson: DEFAULT_SETTINGS,
  createdAt: new Date("2024-01-01"),
  ownerId: "user-1",
  position: 0,
  updatedAt: new Date("2024-01-01"),
  _count: { posts: 0 },
};

describe("board repository", () => {
  afterEach(() => {
    mockReset(prismaMock);
  });

  // ---------------------------------------------------------------------------
  // checkSlugAvailable
  // ---------------------------------------------------------------------------

  describe("checkSlugAvailable", () => {
    it("returns true when no board has the slug", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      expect(await checkSlugAvailable("new-slug")).toBe(true);
    });

    it("returns false when another board has the slug", async () => {
      prismaMock.board.findUnique.mockResolvedValue({ id: "other-id" } as never);
      expect(await checkSlugAvailable("taken-slug")).toBe(false);
    });

    it("returns true when the existing board is excluded by id", async () => {
      prismaMock.board.findUnique.mockResolvedValue({ id: "board-1" } as never);
      expect(await checkSlugAvailable("my-board", "board-1")).toBe(true);
    });

    it("returns false when excludeId doesn't match the existing board", async () => {
      prismaMock.board.findUnique.mockResolvedValue({ id: "board-1" } as never);
      expect(await checkSlugAvailable("my-board", "board-2")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getBoardBySlug
  // ---------------------------------------------------------------------------

  describe("getBoardBySlug", () => {
    it("returns a public board when found", async () => {
      prismaMock.board.findFirst.mockResolvedValue(BASE_ROW as never);
      const result = await getBoardBySlug("my-board");
      expect(result).toMatchObject({ slug: "my-board", isPublic: true });
      expect(prismaMock.board.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: "my-board", isPublic: true } }),
      );
    });

    it("returns null when board is not found", async () => {
      prismaMock.board.findFirst.mockResolvedValue(null);
      expect(await getBoardBySlug("missing")).toBeNull();
    });

    it("does not expose ownerId or position", async () => {
      prismaMock.board.findFirst.mockResolvedValue(BASE_ROW as never);
      const result = await getBoardBySlug("my-board");
      expect(result).not.toHaveProperty("ownerId");
      expect(result).not.toHaveProperty("position");
    });

    it("parses settingsJson into a typed settings object", async () => {
      prismaMock.board.findFirst.mockResolvedValue(BASE_ROW as never);
      const result = await getBoardBySlug("my-board");
      expect(result?.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  // ---------------------------------------------------------------------------
  // getBoardBySlugAdmin
  // ---------------------------------------------------------------------------

  describe("getBoardBySlugAdmin", () => {
    it("returns full board regardless of isPublic", async () => {
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_ROW,
        isPublic: false,
      } as never);
      const result = await getBoardBySlugAdmin("my-board");
      expect(result).toMatchObject({ isPublic: false, ownerId: "user-1", position: 0 });
    });

    it("returns null when not found", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      expect(await getBoardBySlugAdmin("missing")).toBeNull();
    });

    it("includes _count with real post count", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_ROW as never);
      const result = await getBoardBySlugAdmin("my-board");
      expect(result?._count).toEqual({ posts: 0, votes: 0 });
    });
  });

  // ---------------------------------------------------------------------------
  // getBoardById
  // ---------------------------------------------------------------------------

  describe("getBoardById", () => {
    it("returns admin board when found", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_ROW as never);
      const result = await getBoardById("board-1");
      expect(result?.id).toBe("board-1");
    });

    it("returns null when not found", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      expect(await getBoardById("missing")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // listBoards
  // ---------------------------------------------------------------------------

  describe("listBoards", () => {
    it("filters by isPublic for public view", async () => {
      prismaMock.board.findMany.mockResolvedValue([]);
      prismaMock.board.count.mockResolvedValue(0);
      await listBoards({ adminView: false });
      expect(prismaMock.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isPublic: true }) }),
      );
    });

    it("does not filter by isPublic for admin view", async () => {
      prismaMock.board.findMany.mockResolvedValue([]);
      prismaMock.board.count.mockResolvedValue(0);
      await listBoards({ adminView: true });
      const call = prismaMock.board.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.isPublic).toBeUndefined();
    });

    it("returns pagination metadata", async () => {
      prismaMock.board.findMany.mockResolvedValue([BASE_ROW] as never);
      prismaMock.board.count.mockResolvedValue(25);
      const result = await listBoards({ page: 1, limit: 20 });
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(2);
      expect(result.page).toBe(1);
    });

    it("clamps limit to 100", async () => {
      prismaMock.board.findMany.mockResolvedValue([]);
      prismaMock.board.count.mockResolvedValue(0);
      await listBoards({ limit: 9999 });
      expect(prismaMock.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it("applies search filter", async () => {
      prismaMock.board.findMany.mockResolvedValue([]);
      prismaMock.board.count.mockResolvedValue(0);
      await listBoards({ search: "acme" });
      const call = prismaMock.board.findMany.mock.calls[0][0] as { where: { OR?: unknown[] } };
      expect(call.where.OR).toBeDefined();
    });

    it("orders by name when orderBy is 'name'", async () => {
      prismaMock.board.findMany.mockResolvedValue([]);
      prismaMock.board.count.mockResolvedValue(0);
      await listBoards({ orderBy: "name", order: "asc" });
      expect(prismaMock.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ name: "asc" }, { position: "asc" }],
        }),
      );
    });

    it("orders by post count when orderBy is 'postCount'", async () => {
      prismaMock.board.findMany.mockResolvedValue([]);
      prismaMock.board.count.mockResolvedValue(0);
      await listBoards({ orderBy: "postCount" });
      expect(prismaMock.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ posts: { _count: "desc" } }, { position: "asc" }],
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // createBoard
  // ---------------------------------------------------------------------------

  describe("createBoard", () => {
    beforeEach(() => {
      // Pass the mock through as `tx` so per-test board.aggregate / board.create mocks work.
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.board.aggregate.mockResolvedValue({ _max: { position: null } } as never);
    });

    it("creates board and returns admin shape", async () => {
      prismaMock.board.create.mockResolvedValue(BASE_ROW as never);
      const result = await createBoard({
        slug: "my-board",
        name: "My Board",
        ownerId: "user-1",
      });
      expect(result.slug).toBe("my-board");
      expect(result._count.posts).toBe(0);
    });

    it("assigns position 0 when no boards exist", async () => {
      prismaMock.board.create.mockResolvedValue(BASE_ROW as never);
      await createBoard({ slug: "my-board", name: "My Board", ownerId: "user-1" });
      expect(prismaMock.board.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 0 }) }),
      );
    });

    it("assigns max+1 position when boards exist", async () => {
      prismaMock.board.aggregate.mockResolvedValue({ _max: { position: 4 } } as never);
      prismaMock.board.create.mockResolvedValue(BASE_ROW as never);
      await createBoard({ slug: "my-board", name: "My Board", ownerId: "user-1" });
      expect(prismaMock.board.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 5 }) }),
      );
    });

    it("uses default settings when not provided", async () => {
      prismaMock.board.create.mockResolvedValue(BASE_ROW as never);
      await createBoard({ slug: "my-board", name: "My Board", ownerId: "user-1" });
      expect(prismaMock.board.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settingsJson: DEFAULT_SETTINGS,
          }),
        }),
      );
    });

    it("throws CONFLICT AppError on P2002", async () => {
      const p2002 = Object.assign(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "5.0.0",
        }),
      );
      prismaMock.board.create.mockRejectedValue(p2002);
      await expect(
        createBoard({ slug: "taken", name: "Taken", ownerId: "user-1" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("re-throws unknown errors", async () => {
      prismaMock.board.create.mockRejectedValue(new Error("db down"));
      await expect(
        createBoard({ slug: "x", name: "X", ownerId: "user-1" }),
      ).rejects.toThrow("db down");
    });
  });

  // ---------------------------------------------------------------------------
  // updateBoard
  // ---------------------------------------------------------------------------

  describe("updateBoard", () => {
    it("updates name and returns updated board", async () => {
      prismaMock.board.update.mockResolvedValue({ ...BASE_ROW, name: "New Name" } as never);
      const result = await updateBoard("board-1", { name: "New Name" });
      expect(result.name).toBe("New Name");
    });

    it("merges settings with existing when settings provided", async () => {
      prismaMock.board.findUniqueOrThrow.mockResolvedValue(BASE_ROW as never);
      prismaMock.board.update.mockResolvedValue(BASE_ROW as never);
      await updateBoard("board-1", { settings: { guestVotingEnabled: true } });
      expect(prismaMock.board.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settingsJson: expect.objectContaining({ guestVotingEnabled: true }),
          }),
        }),
      );
    });

    it("updates description, visibility, and position", async () => {
      prismaMock.board.update.mockResolvedValue({
        ...BASE_ROW,
        description: "New desc",
        isPublic: false,
        isListed: false,
        position: 3,
      } as never);
      await updateBoard("board-1", {
        description: "New desc",
        isPublic: false,
        isListed: false,
        position: 3,
      });
      expect(prismaMock.board.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: "New desc",
            isPublic: false,
            isListed: false,
            position: 3,
          }),
        }),
      );
    });

    it("throws CONFLICT AppError on P2002", async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "5.0.0",
      });
      prismaMock.board.update.mockRejectedValue(p2002);
      await expect(updateBoard("board-1", { slug: "taken" })).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // deleteBoard
  // ---------------------------------------------------------------------------

  describe("deleteBoard", () => {
    it("deletes votes and posts then board in a transaction", async () => {
      prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          vote: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
          post: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
          board: {
            delete: vi.fn().mockResolvedValue({ id: "board-1", slug: "my-board" }),
          },
        };
        return fn(txMock);
      }) as never);

      const result = await deleteBoard("board-1");
      expect(result.id).toBe("board-1");
      expect(result.slug).toBe("my-board");
      expect(result.deletedCounts).toEqual({ posts: 2, votes: 3, comments: 0 });
    });
  });

  // ---------------------------------------------------------------------------
  // reorderBoards
  // ---------------------------------------------------------------------------

  describe("reorderBoards", () => {
    it("updates positions in a transaction", async () => {
      prismaMock.board.update.mockResolvedValue(BASE_ROW as never);
      prismaMock.$transaction.mockResolvedValue([] as never);
      await reorderBoards([
        { id: "board-1", position: 0 },
        { id: "board-2", position: 1 },
      ]);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });
});
