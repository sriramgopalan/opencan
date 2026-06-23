import { createHmac } from "crypto";

import { Prisma, PostStatus } from "@prisma/client";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { encodeCursor, decodeCursor, sliceAndCursor } from "@/lib/pagination";
import { redis } from "@/lib/redis";
import { prisma } from "@/server/db";
import type {
  AdminPostView,
  CreatedPost,
  MyPost,
  PostListItem,
  PostListResult,
  PostViewer,
  PublicPostView,
  RoadmapPost,
  SimilarPost,
} from "@/types/post";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hashIp(ip: string): string {
  return createHmac("sha256", env.IP_HASH_SECRET).update(ip).digest("hex");
}

function guestVoteKey(boardId: string, postId: string, hashedIp: string): string {
  return `vote:guest:${boardId}:${postId}:${hashedIp}`;
}

const GUEST_VOTE_TTL = 2592000; // 30 days in seconds

// ---------------------------------------------------------------------------
// Input contracts
// ---------------------------------------------------------------------------

interface CreatePostInput {
  boardId: string;
  authorId: string | null;
  guestName: string | null;
  title: string;
  description?: string | null;
  initialStatus: PostStatus;
}

interface UpdatePostInput {
  title?: string;
  description?: string | null;
}

interface ListPostsOptions {
  boardId: string;
  statusFilter?: PostStatus[];
  orderBy?: "votes" | "newest" | "oldest" | "status";
  cursor?: string;
  limit?: number;
  isAdmin?: boolean;
  callerId?: string;
  hashedIp?: string;
}

interface VoterContext {
  userId?: string;
  hashedIp?: string;
}

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

const CREATE_SELECT = {
  id: true,
  postNumber: true,
  boardId: true,
  authorId: true,
  guestName: true,
  title: true,
  description: true,
  status: true,
  isPinned: true,
  voteCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PUBLIC_SELECT = {
  id: true,
  postNumber: true,
  boardId: true,
  guestName: true,
  title: true,
  description: true,
  status: true,
  isPinned: true,
  voteCount: true,
  createdAt: true,
} as const;

const ADMIN_SELECT = {
  id: true,
  postNumber: true,
  boardId: true,
  guestName: true,
  title: true,
  description: true,
  status: true,
  isPinned: true,
  voteCount: true,
  createdAt: true,
  authorId: true,
  author: { select: { id: true, name: true, email: true } },
  pinnedAt: true,
  updatedAt: true,
} as const;

// Prisma result types derived from the select shapes
type CreateRow = Prisma.PostGetPayload<{ select: typeof CREATE_SELECT }>;
type PublicRow = Prisma.PostGetPayload<{ select: typeof PUBLIC_SELECT }>;
type AdminRow = Prisma.PostGetPayload<{ select: typeof ADMIN_SELECT }>;

// ---------------------------------------------------------------------------
// hasVoted resolution
// ---------------------------------------------------------------------------

async function resolveHasVotedBatch(
  postIds: string[],
  boardId: string,
  voter: VoterContext,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  for (const id of postIds) result.set(id, false);
  if (postIds.length === 0) return result;

  if (voter.userId) {
    const votes = await prisma.vote.findMany({
      where: { postId: { in: postIds }, userId: voter.userId },
      select: { postId: true },
    });
    for (const v of votes) result.set(v.postId, true);
  } else if (voter.hashedIp) {
    const hashedIp = voter.hashedIp;
    const keys = postIds.map((id) => guestVoteKey(boardId, id, hashedIp));
    const values = await redis.mget(...keys);
    postIds.forEach((id, i) => {
      if (values[i]) result.set(id, true);
    });
  }
  return result;
}

// F1: delegate to resolveHasVotedBatch to eliminate the duplicate logic
async function resolveHasVoted(
  postId: string,
  boardId: string,
  voter: VoterContext,
): Promise<boolean> {
  return (await resolveHasVotedBatch([postId], boardId, voter)).get(postId) ?? false;
}

// F4: shared PENDING visibility guard used in getPostById and getPostByNumber
async function isPendingVisible(postId: string, callerId?: string): Promise<boolean> {
  if (!callerId) return false;
  const meta = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  return !!meta && meta.authorId === callerId;
}

// ---------------------------------------------------------------------------
// Build WHERE and ORDER BY
// ---------------------------------------------------------------------------

function buildVisibilityCondition(isAdmin: boolean, callerId?: string): Prisma.PostWhereInput {
  if (isAdmin) return {};
  return {
    OR: [
      { status: { not: PostStatus.PENDING } },
      ...(callerId ? [{ status: PostStatus.PENDING, authorId: callerId }] : []),
    ],
  };
}

function buildListWhere(
  boardId: string,
  statusFilter: PostStatus[] | undefined,
  isAdmin: boolean,
  callerId?: string,
): Prisma.PostWhereInput {
  const visibilityCondition = buildVisibilityCondition(isAdmin, callerId);

  const statusCondition: Prisma.PostWhereInput =
    statusFilter && statusFilter.length > 0 ? { status: { in: statusFilter } } : {};

  return { boardId, AND: [visibilityCondition, statusCondition] };
}

function buildOrderBy(orderBy: "votes" | "newest" | "oldest" | "status"): Prisma.PostOrderByWithRelationInput[] {
  const pinFirst: Prisma.PostOrderByWithRelationInput[] = [
    { isPinned: "desc" },
    { pinnedAt: "desc" },
  ];
  switch (orderBy) {
    case "votes":
      return [...pinFirst, { voteCount: "desc" }, { createdAt: "desc" }, { postNumber: "asc" }];
    case "newest":
      return [...pinFirst, { createdAt: "desc" }, { postNumber: "asc" }];
    case "oldest":
      return [...pinFirst, { createdAt: "asc" }, { postNumber: "asc" }];
    case "status":
      return [...pinFirst, { status: "asc" }, { createdAt: "desc" }, { postNumber: "asc" }];
  }
}

// ---------------------------------------------------------------------------
// Pagination helper (F3)
// ---------------------------------------------------------------------------

async function queryAndPaginate<T extends { id: string; createdAt: Date }>(
  findManyFn: () => Promise<T[]>,
  clampedLimit: number,
  boardId: string,
  voter: VoterContext,
): Promise<{ page: T[]; nextCursor: string | null; hasVotedMap: Map<string, boolean> }> {
  const rows = await findManyFn();
  const hasNextPage = rows.length > clampedLimit;
  const page = hasNextPage ? rows.slice(0, clampedLimit) : rows;
  const lastItem = page[page.length - 1];
  const nextCursor = hasNextPage && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;
  const hasVotedMap = await resolveHasVotedBatch(page.map((r) => r.id), boardId, voter);
  return { page, nextCursor, hasVotedMap };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPostById(
  id: string,
  viewer: PostViewer,
): Promise<PublicPostView | AdminPostView | null> {
  const voter: VoterContext = { userId: viewer.callerId, hashedIp: viewer.hashedIp };

  if (viewer.isAdmin) {
    const row: AdminRow | null = await prisma.post.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!row) return null;
    const hasVoted = await resolveHasVoted(row.id, row.boardId, voter);
    return { ...row, hasVoted };
  }

  const row: PublicRow | null = await prisma.post.findUnique({ where: { id }, select: PUBLIC_SELECT });
  if (!row) return null;

  // H2: check board visibility for non-admin callers
  const board = await prisma.board.findUnique({ where: { id: row.boardId }, select: { isPublic: true } });
  if (!board?.isPublic) return null;

  if (row.status === PostStatus.PENDING) {
    if (!await isPendingVisible(id, viewer.callerId)) return null;
  }

  const hasVoted = await resolveHasVoted(row.id, row.boardId, voter);
  return { ...row, hasVoted };
}

export async function getPostByNumber(
  boardSlug: string,
  postNumber: number,
  viewer: PostViewer,
): Promise<PublicPostView | AdminPostView | null> {
  const voter: VoterContext = { userId: viewer.callerId, hashedIp: viewer.hashedIp };

  if (viewer.isAdmin) {
    const row: AdminRow | null = await prisma.post.findFirst({
      where: { postNumber, board: { slug: boardSlug } },
      select: ADMIN_SELECT,
    });
    if (!row) return null;
    const hasVoted = await resolveHasVoted(row.id, row.boardId, voter);
    return { ...row, hasVoted };
  }

  // H3: restrict non-admin to public boards via WHERE condition
  const row: PublicRow | null = await prisma.post.findFirst({
    where: { postNumber, board: { slug: boardSlug, isPublic: true } },
    select: PUBLIC_SELECT,
  });
  if (!row) return null;

  if (row.status === PostStatus.PENDING) {
    if (!await isPendingVisible(row.id, viewer.callerId)) return null;
  }

  const hasVoted = await resolveHasVoted(row.id, row.boardId, voter);
  return { ...row, hasVoted };
}

function toListItem(
  r: {
    id: string;
    postNumber: number;
    title: string;
    description: string | null;
    status: PostStatus;
    isPinned: boolean;
    voteCount: number;
    createdAt: Date;
  },
  hasVotedMap: Map<string, boolean>,
) {
  return {
    id: r.id,
    postNumber: r.postNumber,
    title: r.title,
    description: r.description,
    status: r.status,
    isPinned: r.isPinned,
    voteCount: r.voteCount,
    hasVoted: hasVotedMap.get(r.id) ?? false,
    createdAt: r.createdAt,
  };
}

export async function listPosts(opts: ListPostsOptions): Promise<PostListResult> {
  const {
    boardId,
    statusFilter,
    orderBy = "votes",
    cursor,
    limit = 20,
    isAdmin = false,
    callerId,
    hashedIp,
  } = opts;

  const clampedLimit = Math.min(Math.max(1, limit), 50);
  const where = buildListWhere(boardId, statusFilter, isAdmin, callerId);
  const orderByClause = buildOrderBy(orderBy);
  const voter: VoterContext = { userId: callerId, hashedIp };

  // L3: decode compound cursor to extract the id for Prisma's cursor parameter
  const cursorId = cursor ? decodeCursor(cursor) : undefined;

  if (isAdmin) {
    const { page, nextCursor, hasVotedMap } = await queryAndPaginate<AdminRow>(
      () => cursorId
        ? prisma.post.findMany({ where, orderBy: orderByClause, take: clampedLimit + 1, cursor: { id: cursorId }, skip: 1, select: ADMIN_SELECT })
        : prisma.post.findMany({ where, orderBy: orderByClause, take: clampedLimit + 1, select: ADMIN_SELECT }),
      clampedLimit,
      boardId,
      voter,
    );
    return {
      items: page.map((r) => ({
        ...toListItem(r, hasVotedMap),
        guestName: r.guestName,
        authorId: r.authorId,
        author: r.author,
      })),
      nextCursor,
    };
  }

  const { page, nextCursor, hasVotedMap } = await queryAndPaginate<PublicRow>(
    () => cursorId
      ? prisma.post.findMany({ where, orderBy: orderByClause, take: clampedLimit + 1, cursor: { id: cursorId }, skip: 1, select: PUBLIC_SELECT })
      : prisma.post.findMany({ where, orderBy: orderByClause, take: clampedLimit + 1, select: PUBLIC_SELECT }),
    clampedLimit,
    boardId,
    voter,
  );
  return {
    items: page.map((r) => toListItem(r, hasVotedMap)),
    nextCursor,
  };
}

export async function getSimilarPosts(boardId: string, title: string): Promise<SimilarPost[]> {
  const rows = await prisma.$queryRaw<
    Array<{ postNumber: number; title: string; voteCount: number; status: string }>
  >`
    SELECT "postNumber", "title", "voteCount", "status"::text AS status
    FROM "Post"
    WHERE "boardId" = ${boardId}
      AND "status" != 'PENDING'
      AND similarity("title", ${title}) >= 0.4
    ORDER BY similarity("title", ${title}) DESC
    LIMIT 5
  `;
  return rows.map((r) => ({
    postNumber: r.postNumber,
    title: r.title,
    voteCount: r.voteCount,
    status: r.status as PostStatus,
  }));
}

// Pre-condition: callers must ensure boardId belongs to a public board for non-admin contexts,
// or pass isAdmin: true. Board visibility is enforced at the tRPC layer via requireBoardVisible.
export async function searchPosts(
  boardId: string,
  query: string,
  opts: { isAdmin?: boolean; callerId?: string; limit?: number } = {},
): Promise<PostListItem[]> {
  const { isAdmin = false, callerId, limit = 20 } = opts;
  const clampedLimit = Math.min(Math.max(1, limit), 50);

  const rows = await prisma.post.findMany({
    where: { boardId, title: { contains: query, mode: "insensitive" }, AND: [buildVisibilityCondition(isAdmin, callerId)] },
    orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
    take: clampedLimit,
    select: PUBLIC_SELECT,
  });

  return rows.map((r) => ({
    id: r.id,
    postNumber: r.postNumber,
    title: r.title,
    description: r.description,
    status: r.status,
    isPinned: r.isPinned,
    voteCount: r.voteCount,
    hasVoted: false,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createPost(input: CreatePostInput): Promise<CreatedPost> {
  try {
    return await prisma.$transaction(async (tx) => {
      const agg = await tx.post.aggregate({
        where: { boardId: input.boardId },
        _max: { postNumber: true },
      });
      const nextPostNumber = (agg._max.postNumber ?? 0) + 1;
      const row: CreateRow = await tx.post.create({
        data: {
          boardId: input.boardId,
          authorId: input.authorId,
          guestName: input.guestName,
          title: input.title,
          description: input.description ?? null,
          status: input.initialStatus,
          postNumber: nextPostNumber,
        },
        select: CREATE_SELECT,
      });
      return row;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "Post number conflict. Please try again.");
    }
    throw e as Error;
  }
}

export async function updatePost(
  id: string,
  data: UpdatePostInput,
  viewer: { isAdmin: boolean; callerId: string },
): Promise<AdminPostView> {
  const existing = await prisma.post.findUnique({
    where: { id },
    select: { authorId: true, status: true },
  });

  // L1: throw AppErrors to allow router to log at appropriate levels
  if (!existing) throw new AppError("NOT_FOUND", "Post not found.");

  if (!viewer.isAdmin) {
    if (existing.authorId !== viewer.callerId) {
      throw new AppError("FORBIDDEN", "You don't have permission to edit this post.");
    }
    if (existing.status === PostStatus.SHIPPED || existing.status === PostStatus.CLOSED) {
      throw new AppError("VALIDATION_ERROR", "This post can no longer be edited.", {
        status: existing.status,
      });
    }
  }

  const updateData: Prisma.PostUpdateInput = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;

  let row: AdminRow;
  if (Object.keys(updateData).length === 0) {
    // no-op: return current state without touching updatedAt
    const found = await prisma.post.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!found) throw new AppError("NOT_FOUND", "Post not found.");
    row = found;
  } else {
    row = await prisma.post.update({ where: { id }, data: updateData, select: ADMIN_SELECT });
  }

  // F2: use resolveHasVoted instead of inlining the vote lookup
  const hasVoted = await resolveHasVoted(id, row.boardId, { userId: viewer.callerId });
  return { ...row, hasVoted };
}

export async function deletePost(
  id: string,
): Promise<{ id: string; deletedCounts: { votes: number } }> {
  const result = await prisma.$transaction(async (tx) => {
    const votes = await tx.vote.deleteMany({ where: { postId: id } });
    const post = await tx.post.delete({ where: { id }, select: { id: true } });
    return { post, votes: votes.count };
  });
  return { id: result.post.id, deletedCounts: { votes: result.votes } };
}

// F9: shared read-check-update pattern for setPostStatus and setPostPin
async function applyIdempotentUpdate<T, R>(
  currentValue: T,
  newValue: T,
  noOpFn: () => Promise<R | null>,
  updateFn: () => Promise<R>,
): Promise<R | null> {
  if (currentValue === newValue) return noOpFn();
  return updateFn();
}

export async function getPostAuthorId(postId: string): Promise<string | null> {
  const row = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  return row?.authorId ?? null;
}

export async function setPostStatus(
  id: string,
  status: PostStatus,
): Promise<{ id: string; postNumber: number; boardId: string; title: string; previousStatus: PostStatus; status: PostStatus; updatedAt: Date } | null> {
  const existing = await prisma.post.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return null;
  const previousStatus = existing.status;
  const select = { id: true, postNumber: true, boardId: true, title: true, status: true, updatedAt: true } as const;
  const result = await applyIdempotentUpdate(
    existing.status,
    status,
    () => prisma.post.findUnique({ where: { id }, select }),
    () => prisma.post.update({ where: { id }, data: { status }, select }),
  );
  if (!result) return null;
  return { ...result, previousStatus };
}

interface PostNotificationContext {
  postNumber: number;
  title: string;
  boardSlug: string;
  authorEmail: string | null;
  notifyOnStatusChange: boolean;
}

export async function getPostAuthorForNotification(
  postId: string,
): Promise<PostNotificationContext | null> {
  const row = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      postNumber: true,
      title: true,
      board: { select: { slug: true } },
      author: { select: { email: true, notifyOnStatusChange: true } },
    },
  });
  if (!row) return null;
  return {
    postNumber: row.postNumber,
    title: row.title,
    boardSlug: row.board.slug,
    authorEmail: row.author?.email ?? null,
    notifyOnStatusChange: row.author?.notifyOnStatusChange ?? false,
  };
}

export async function setPostPin(
  id: string,
  pinned: boolean,
): Promise<{ id: string; isPinned: boolean; pinnedAt: Date | null } | null> {
  const existing = await prisma.post.findUnique({ where: { id }, select: { isPinned: true } });
  if (!existing) return null;
  const select = { id: true, isPinned: true, pinnedAt: true } as const;
  return applyIdempotentUpdate(
    existing.isPinned,
    pinned,
    () => prisma.post.findUnique({ where: { id }, select }),
    () => prisma.post.update({ where: { id }, data: { isPinned: pinned, pinnedAt: pinned ? new Date() : null }, select }),
  );
}

export async function toggleVote(
  postId: string,
  voter: { userId?: string; hashedIp?: string; boardId: string },
): Promise<{ voteCount: number; userHasVoted: boolean }> {
  if (voter.userId) {
    const userId = voter.userId;
    return prisma.$transaction(async (tx) => {
      const existing = await tx.vote.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { id: true },
      });
      if (existing) {
        await tx.vote.delete({ where: { id: existing.id } });
        const post = await tx.post.update({
          where: { id: postId },
          data: { voteCount: { decrement: 1 } },
          select: { voteCount: true },
        });
        logger.info({ postId, userId, action: "unvote" }, "vote recorded");
        return { voteCount: post.voteCount, userHasVoted: false };
      }
      await tx.vote.create({ data: { postId, userId } });
      const post = await tx.post.update({
        where: { id: postId },
        data: { voteCount: { increment: 1 } },
        select: { voteCount: true },
      });
      logger.info({ postId, userId, action: "vote" }, "vote recorded");
      return { voteCount: post.voteCount, userHasVoted: true };
    });
  }

  if (!voter.hashedIp) throw new AppError("VALIDATION_ERROR", "Unable to identify voter.");

  // M1: atomic SET NX EX eliminates the TOCTOU race between exists() and set()
  const key = guestVoteKey(voter.boardId, postId, voter.hashedIp);
  const acquired = await redis.set(key, "1", "EX", GUEST_VOTE_TTL, "NX");
  if (acquired === null) {
    throw new AppError("FORBIDDEN", "You have already voted on this post.");
  }

  const post = await prisma.$transaction(async (tx) => {
    await tx.vote.create({ data: { postId } });
    return tx.post.update({
      where: { id: postId },
      data: { voteCount: { increment: 1 } },
      select: { voteCount: true },
    });
  });
  logger.info({ postId, userId: "[guest]", action: "vote" }, "vote recorded");
  return { voteCount: post.voteCount, userHasVoted: false };
}

// ---------------------------------------------------------------------------
// Roadmap + My Posts
// ---------------------------------------------------------------------------

const BOARD_SLUG_NAME_SELECT = { select: { slug: true, name: true } } as const;

const ROADMAP_STATUSES = [
  PostStatus.UNDER_REVIEW,
  PostStatus.PLANNED,
  PostStatus.IN_PROGRESS,
  PostStatus.SHIPPED,
] as const;

const ROADMAP_SELECT = {
  id: true,
  postNumber: true,
  boardId: true,
  title: true,
  description: true,
  status: true,
  voteCount: true,
  createdAt: true,
  board: BOARD_SLUG_NAME_SELECT,
} as const;

type RoadmapRow = Prisma.PostGetPayload<{ select: typeof ROADMAP_SELECT }>;

const ROADMAP_QUERY_CAP = 200;

const MY_POST_SELECT = {
  id: true,
  postNumber: true,
  title: true,
  description: true,
  status: true,
  voteCount: true,
  createdAt: true,
  board: BOARD_SLUG_NAME_SELECT,
} as const;

type MyPostRow = Prisma.PostGetPayload<{ select: typeof MY_POST_SELECT }>;

export async function getPostsByAuthor(
  authorId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ items: MyPost[]; nextCursor: string | null }> {
  const clampedLimit = Math.min(Math.max(1, opts.limit ?? 20), 50);
  const cursorId = opts.cursor ? decodeCursor(opts.cursor) : undefined;
  const orderBy: Prisma.PostOrderByWithRelationInput[] = [{ createdAt: "desc" }, { postNumber: "desc" }];

  const rows: MyPostRow[] = await (cursorId
    ? prisma.post.findMany({
        where: { authorId },
        orderBy,
        take: clampedLimit + 1,
        cursor: { id: cursorId },
        skip: 1,
        select: MY_POST_SELECT,
      })
    : prisma.post.findMany({
        where: { authorId },
        orderBy,
        take: clampedLimit + 1,
        select: MY_POST_SELECT,
      }));

  const { items, nextCursor } = sliceAndCursor(rows, clampedLimit, (r) => r.createdAt);

  return {
    items: items.map((r) => ({
      id: r.id,
      postNumber: r.postNumber,
      title: r.title,
      description: r.description,
      status: r.status,
      voteCount: r.voteCount,
      createdAt: r.createdAt,
      boardSlug: r.board.slug,
      boardName: r.board.name,
    })),
    nextCursor,
  };
}

export async function getRoadmapPosts(): Promise<RoadmapPost[]> {
  const rows: RoadmapRow[] = await prisma.post.findMany({
    where: {
      status: { in: [...ROADMAP_STATUSES] },
      board: { isPublic: true },
    },
    select: ROADMAP_SELECT,
    orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
    take: ROADMAP_QUERY_CAP,
  });

  return rows.map((r) => ({
    id: r.id,
    postNumber: r.postNumber,
    boardId: r.boardId,
    boardSlug: r.board.slug,
    boardName: r.board.name,
    title: r.title,
    description: r.description,
    status: r.status,
    voteCount: r.voteCount,
    createdAt: r.createdAt,
  }));
}
