import type { PostStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import type { AdminPostsResult, AdminUsersResult, PendingPost, WorkspaceStats } from "@/types/admin";

export type { AdminPost, AdminPostsResult, AdminUser, AdminUsersResult, PendingPost, WorkspaceStats } from "@/types/admin";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function getWorkspaceStats(): Promise<WorkspaceStats> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [
    totalBoards,
    totalPosts,
    voteAggregate,
    totalComments,
    totalUsers,
    newPostsLast30Days,
    newUsersLast30Days,
  ] = await Promise.all([
    prisma.board.count(),
    prisma.post.count(),
    prisma.post.aggregate({ _sum: { voteCount: true } }),
    prisma.comment.count(),
    prisma.user.count(),
    prisma.post.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
  ]);

  return {
    totalBoards,
    totalPosts,
    totalVotes: voteAggregate._sum.voteCount ?? 0,
    totalComments,
    totalUsers,
    newPostsLast30Days,
    newUsersLast30Days,
  };
}

export async function listAdminUsers({
  page,
  limit,
  search,
}: {
  page: number;
  limit: number;
  search?: string;
}): Promise<AdminUsersResult> {
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        suspendedAt: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { posts: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getPendingPostCount(): Promise<number> {
  return prisma.post.count({ where: { status: "PENDING" } });
}

export async function listAllPosts({
  status,
  boardId,
  page = 1,
  limit = 20,
}: {
  status?: PostStatus;
  boardId?: string;
  page?: number;
  limit?: number;
} = {}): Promise<AdminPostsResult> {
  const where = {
    ...(status !== undefined ? { status } : {}),
    ...(boardId !== undefined ? { boardId } : {}),
  };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: {
        id: true,
        postNumber: true,
        title: true,
        description: true,
        status: true,
        isPinned: true,
        voteCount: true,
        guestName: true,
        authorId: true,
        createdAt: true,
        board: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  return { posts, total, page, totalPages: Math.ceil(total / limit) };
}

export async function listPendingPosts(): Promise<PendingPost[]> {
  return prisma.post.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      postNumber: true,
      title: true,
      description: true,
      guestName: true,
      createdAt: true,
      board: { select: { id: true, slug: true, name: true } },
      author: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
