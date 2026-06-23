import type { Prisma } from "@prisma/client";

import { AppError } from "@/lib/errors";
import { encodeCursor, decodeCursor } from "@/lib/pagination";
import { prisma } from "@/server/db";
import type {
  ChangelogAdminItem,
  ChangelogEntryDetail,
  ChangelogEntryListItem,
} from "@/types/changelog";

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  publishedAt: true,
  author: { select: { name: true } },
  _count: { select: { linkedPosts: true } },
} as const;

const DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  body: true,
  publishedAt: true,
  author: { select: { name: true } },
  linkedPosts: {
    select: {
      post: {
        select: {
          id: true,
          postNumber: true,
          title: true,
          status: true,
          board: { select: { slug: true, name: true } },
        },
      },
    },
  },
} as const;

const ADMIN_SELECT = {
  id: true,
  slug: true,
  title: true,
  publishedAt: true,
  createdAt: true,
  author: { select: { name: true } },
  _count: { select: { linkedPosts: true } },
} as const;

type ListRow = Prisma.ChangelogEntryGetPayload<{ select: typeof LIST_SELECT }>;
type AdminRow = Prisma.ChangelogEntryGetPayload<{ select: typeof ADMIN_SELECT }>;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toListItem(row: ListRow): ChangelogEntryListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    publishedAt: row.publishedAt as Date,
    authorName: row.author.name ?? null,
    linkedPostCount: row._count.linkedPosts,
  };
}

function toAdminItem(row: AdminRow): ChangelogAdminItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    authorName: row.author.name ?? null,
    linkedPostCount: row._count.linkedPosts,
  };
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function listChangelogEntries(opts: {
  cursor?: string;
  limit?: number;
}): Promise<{ items: ChangelogEntryListItem[]; nextCursor: string | null }> {
  const clampedLimit = Math.min(Math.max(1, opts.limit ?? 10), 50);
  const cursorId = opts.cursor ? decodeCursor(opts.cursor) : undefined;

  const rows = await prisma.changelogEntry.findMany({
    where: { publishedAt: { not: null } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: clampedLimit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: LIST_SELECT,
  });

  const hasMore = rows.length > clampedLimit;
  const items = hasMore ? rows.slice(0, clampedLimit) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.publishedAt as Date, last.id) : null;

  return { items: items.map(toListItem), nextCursor };
}

export async function getChangelogEntryBySlug(
  slug: string,
): Promise<ChangelogEntryDetail | null> {
  const row = await prisma.changelogEntry.findUnique({
    where: { slug, publishedAt: { not: null } },
    select: DETAIL_SELECT,
  });
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt as Date,
    authorName: row.author.name ?? null,
    linkedPosts: row.linkedPosts.map(({ post }) => ({
      id: post.id,
      postNumber: post.postNumber,
      title: post.title,
      status: post.status,
      boardSlug: post.board.slug,
      boardName: post.board.name,
    })),
  };
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export async function listAllChangelogEntries(opts: {
  cursor?: string;
  limit?: number;
}): Promise<{ items: ChangelogAdminItem[]; nextCursor: string | null }> {
  const clampedLimit = Math.min(Math.max(1, opts.limit ?? 20), 50);
  const cursorId = opts.cursor ? decodeCursor(opts.cursor) : undefined;

  const rows = await prisma.changelogEntry.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: clampedLimit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: ADMIN_SELECT,
  });

  const hasMore = rows.length > clampedLimit;
  const items = hasMore ? rows.slice(0, clampedLimit) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items: items.map(toAdminItem), nextCursor };
}

export async function getChangelogEntryById(
  id: string,
): Promise<{ id: string; slug: string; title: string; body: string; publishedAt: Date | null; linkedPostIds: string[] } | null> {
  const row = await prisma.changelogEntry.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      body: true,
      publishedAt: true,
      linkedPosts: { select: { postId: true } },
    },
  });
  if (!row) return null;
  return { ...row, linkedPostIds: row.linkedPosts.map((lp) => lp.postId) };
}

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------

export async function createChangelogEntry(data: {
  slug: string;
  title: string;
  body: string;
  authorId: string;
  linkedPostIds?: string[];
}): Promise<{ id: string; slug: string }> {
  const { slug, title, body, authorId, linkedPostIds = [] } = data;

  const existing = await prisma.changelogEntry.findUnique({ where: { slug }, select: { id: true } });
  if (existing) throw new AppError("CONFLICT", "A changelog entry with this slug already exists.");

  const entry = await prisma.changelogEntry.create({
    data: {
      slug,
      title,
      body,
      authorId,
      linkedPosts: linkedPostIds.length
        ? { create: linkedPostIds.map((postId) => ({ postId })) }
        : undefined,
    },
    select: { id: true, slug: true },
  });
  return entry;
}

export async function updateChangelogEntry(
  id: string,
  data: { title?: string; body?: string; linkedPostIds?: string[] },
): Promise<{ id: string }> {
  const existing = await prisma.changelogEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError("NOT_FOUND", "Changelog entry not found.");

  await prisma.$transaction(async (tx) => {
    if (data.title !== undefined || data.body !== undefined) {
      await tx.changelogEntry.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.body !== undefined ? { body: data.body } : {}),
        },
      });
    }
    if (data.linkedPostIds !== undefined) {
      await tx.changelogEntryPost.deleteMany({ where: { entryId: id } });
      if (data.linkedPostIds.length > 0) {
        await tx.changelogEntryPost.createMany({
          data: data.linkedPostIds.map((postId) => ({ entryId: id, postId })),
          skipDuplicates: true,
        });
      }
    }
  });

  return { id };
}

export async function publishChangelogEntry(
  id: string,
): Promise<{ id: string; publishedAt: Date; linkedPostIds: string[] }> {
  const existing = await prisma.changelogEntry.findUnique({
    where: { id },
    select: { id: true, publishedAt: true, linkedPosts: { select: { postId: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Changelog entry not found.");
  if (existing.publishedAt !== null) throw new AppError("CONFLICT", "Entry is already published.");

  const publishedAt = new Date();
  await prisma.changelogEntry.update({
    where: { id },
    data: { publishedAt },
  });

  return { id, publishedAt, linkedPostIds: existing.linkedPosts.map((lp) => lp.postId) };
}

export async function deleteChangelogEntry(id: string): Promise<{ id: string }> {
  const existing = await prisma.changelogEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError("NOT_FOUND", "Changelog entry not found.");

  await prisma.changelogEntry.delete({ where: { id } });
  return { id };
}

// ---------------------------------------------------------------------------
// Notification fan-out helper
// ---------------------------------------------------------------------------

export async function getVoterEmailsForPosts(postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];

  const votes = await prisma.vote.findMany({
    where: {
      postId: { in: postIds },
      userId: { not: null },
      user: { notifyOnStatusChange: true },
    },
    select: { user: { select: { email: true } } },
  });

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const v of votes) {
    const email = v.user?.email;
    if (email && !seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }
  return emails;
}
