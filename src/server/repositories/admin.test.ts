import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db";
import { mockReset, type DeepMockProxy, type PrismaClient } from "@/tests/helpers/repository-setup";

vi.mock("@/server/db");

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { getWorkspaceStats, listAdminUsers, listPendingPosts } =
  await import("@/server/repositories/admin");

describe("admin repository", () => {
  afterEach(() => {
    mockReset(prismaMock);
  });

  describe("getWorkspaceStats", () => {
    it("returns aggregated workspace statistics", async () => {
      prismaMock.board.count.mockResolvedValue(3);
      prismaMock.post.count.mockResolvedValue(10);
      prismaMock.post.aggregate.mockResolvedValue({ _sum: { voteCount: 42 } } as never);
      prismaMock.comment.count.mockResolvedValue(55);
      prismaMock.user.count.mockResolvedValue(7);

      const stats = await getWorkspaceStats();

      expect(stats.totalBoards).toBe(3);
      expect(stats.totalPosts).toBe(10);
      expect(stats.totalVotes).toBe(42);
      expect(stats.totalComments).toBe(55);
      expect(stats.totalUsers).toBe(7);
      expect(typeof stats.newPostsLast30Days).toBe("number");
      expect(typeof stats.newUsersLast30Days).toBe("number");
    });

    it("returns 0 totalVotes when aggregate sum is null", async () => {
      prismaMock.board.count.mockResolvedValue(0);
      prismaMock.post.count.mockResolvedValue(0);
      prismaMock.post.aggregate.mockResolvedValue({ _sum: { voteCount: null } } as never);
      prismaMock.comment.count.mockResolvedValue(0);
      prismaMock.user.count.mockResolvedValue(0);

      const stats = await getWorkspaceStats();
      expect(stats.totalVotes).toBe(0);
    });
  });

  describe("listAdminUsers", () => {
    const mockUser = {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      image: null,
      role: "MEMBER",
      suspendedAt: null,
      emailVerified: null,
      createdAt: new Date(),
      _count: { posts: 2, comments: 5 },
    };

    it("returns paginated users with totals", async () => {
      prismaMock.user.findMany.mockResolvedValue([mockUser] as never);
      prismaMock.user.count.mockResolvedValue(1);

      const result = await listAdminUsers({ page: 1, limit: 20 });

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("passes search filter to query", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await listAdminUsers({ page: 1, limit: 20, search: "alice" });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it("skips correctly for page 2", async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await listAdminUsers({ page: 2, limit: 10 });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe("listPendingPosts", () => {
    it("returns only PENDING posts ordered by createdAt", async () => {
      const mockPost = {
        id: "post-1",
        postNumber: 1,
        title: "Test post",
        description: null,
        createdAt: new Date(),
        board: { id: "board-1", slug: "feedback", name: "Feedback" },
        author: null,
      };
      prismaMock.post.findMany.mockResolvedValue([mockPost] as never);

      const posts = await listPendingPosts();

      expect(posts).toHaveLength(1);
      expect(prismaMock.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
        }),
      );
    });
  });
});
