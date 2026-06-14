import { Prisma } from "@prisma/client";

import { BoardSettingsSchema, type BoardSettings } from "@/lib/board-settings";
import { AppError } from "@/lib/errors";
import { prisma } from "@/server/db";
import type { AdminBoard, BoardListItem, BoardListResult, SafeBoard } from "@/types/board";

// ---------------------------------------------------------------------------
// Internal input/option contracts
// ---------------------------------------------------------------------------

export interface CreateBoardInput {
  slug: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  isListed?: boolean;
  settings?: Partial<BoardSettings>;
  ownerId: string;
}

export interface UpdateBoardData {
  slug?: string;
  name?: string;
  description?: string | null;
  isPublic?: boolean;
  isListed?: boolean;
  settings?: Partial<BoardSettings>;
  position?: number;
}

export interface ListBoardsOptions {
  adminView?: boolean;
  page?: number;
  limit?: number;
  orderBy?: "name" | "createdAt" | "postCount";
  order?: "asc" | "desc";
  search?: string;
}

export interface DeleteBoardResult {
  id: string;
  slug: string;
  deletedCounts: { posts: number; votes: number; comments: number };
}

// Re-export public shapes so consumers can import from one place.
export type { AdminBoard, BoardListItem, BoardListResult, SafeBoard };

// ---------------------------------------------------------------------------
// Select constants
// ---------------------------------------------------------------------------

const ADMIN_BOARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  isPublic: true,
  isListed: true,
  settingsJson: true,
  createdAt: true,
  ownerId: true,
  position: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// TODO: replace with real counts when Post model is added
const STUB_COUNTS = { posts: 0, votes: 0 } as const;

function parseSettings(raw: Prisma.JsonValue): BoardSettings {
  return BoardSettingsSchema.parse(raw ?? {});
}

function toSafeBoard(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isListed: boolean;
  settingsJson: Prisma.JsonValue;
  createdAt: Date;
}): SafeBoard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    isListed: row.isListed,
    settings: parseSettings(row.settingsJson),
    createdAt: row.createdAt,
  };
}

function toAdminBoard(
  row: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    isListed: boolean;
    settingsJson: Prisma.JsonValue;
    createdAt: Date;
    ownerId: string;
    position: number;
    updatedAt: Date;
  },
  counts: { posts: number; votes: number },
): AdminBoard {
  return {
    ...toSafeBoard(row),
    ownerId: row.ownerId,
    position: row.position,
    updatedAt: row.updatedAt,
    _count: counts,
  };
}

function handleWriteError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    throw new AppError("CONFLICT", "That URL is already in use. Please choose another.");
  throw e as Error;
}

function buildWhere(adminView: boolean, search: string | undefined): Prisma.BoardWhereInput {
  const where: Prisma.BoardWhereInput = {};
  if (!adminView) where.isPublic = true;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

function buildOrderBy(
  orderBy: "name" | "createdAt" | "postCount",
  order: "asc" | "desc",
): Prisma.BoardOrderByWithRelationInput[] {
  if (orderBy === "name") return [{ name: order }, { position: "asc" }];
  // TODO: order by _count.posts when Post model is added
  if (orderBy === "postCount") return [{ position: "asc" }, { createdAt: "desc" }];
  return [{ createdAt: order }, { position: "asc" }];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function checkSlugAvailable(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const board = await prisma.board.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!board) return true;
  return excludeId !== undefined && board.id === excludeId;
}

export async function getBoardBySlug(slug: string): Promise<SafeBoard | null> {
  const row = await prisma.board.findFirst({
    where: { slug, isPublic: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      isPublic: true,
      isListed: true,
      settingsJson: true,
      createdAt: true,
    },
  });
  return row ? toSafeBoard(row) : null;
}

export async function getBoardBySlugAdmin(slug: string): Promise<AdminBoard | null> {
  const row = await prisma.board.findUnique({ where: { slug }, select: ADMIN_BOARD_SELECT });
  if (!row) return null;
  return toAdminBoard(row, STUB_COUNTS);
}

export async function getBoardById(id: string): Promise<AdminBoard | null> {
  const row = await prisma.board.findUnique({ where: { id }, select: ADMIN_BOARD_SELECT });
  if (!row) return null;
  return toAdminBoard(row, STUB_COUNTS);
}

export async function listBoards(opts: ListBoardsOptions = {}): Promise<BoardListResult> {
  const {
    adminView = false,
    page = 1,
    limit = 20,
    orderBy = "createdAt",
    order = "desc",
    search,
  } = opts;

  const clampedLimit = Math.min(Math.max(1, limit), 100);
  const clampedPage = Math.max(1, page);
  const skip = (clampedPage - 1) * clampedLimit;
  const safeSearch = search?.slice(0, 200);

  const where = buildWhere(adminView, safeSearch);
  const orderByClause = buildOrderBy(orderBy, order);

  const [rows, total] = await Promise.all([
    prisma.board.findMany({
      where,
      orderBy: orderByClause,
      skip,
      take: clampedLimit,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        isPublic: true,
        isListed: true,
        position: true,
        createdAt: true,
      },
    }),
    prisma.board.count({ where }),
  ]);

  return { boards: rows, total, page: clampedPage, totalPages: Math.ceil(total / clampedLimit) };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createBoard(input: CreateBoardInput): Promise<AdminBoard> {
  const settings = BoardSettingsSchema.parse(input.settings ?? {});
  try {
    const row = await prisma.$transaction(async (tx) => {
      const maxPosition = await tx.board.aggregate({ _max: { position: true } });
      const nextPosition = (maxPosition._max.position ?? -1) + 1;
      return tx.board.create({
        data: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          isPublic: input.isPublic ?? false,
          isListed: input.isListed ?? false,
          settingsJson: settings as Prisma.InputJsonValue,
          position: nextPosition,
          ownerId: input.ownerId,
        },
        select: ADMIN_BOARD_SELECT,
      });
    });
    return toAdminBoard(row, STUB_COUNTS);
  } catch (e) {
    handleWriteError(e);
  }
}

export async function updateBoard(id: string, data: UpdateBoardData): Promise<AdminBoard> {
  const update: Prisma.BoardUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.isPublic !== undefined) update.isPublic = data.isPublic;
  if (data.isListed !== undefined) update.isListed = data.isListed;
  if (data.position !== undefined) update.position = data.position;
  if (data.slug !== undefined) update.slug = data.slug;
  if (data.settings !== undefined) {
    const existing = await prisma.board.findUniqueOrThrow({
      where: { id },
      select: { settingsJson: true },
    });
    const merged = BoardSettingsSchema.parse({
      ...parseSettings(existing.settingsJson),
      ...data.settings,
    });
    update.settingsJson = merged as Prisma.InputJsonValue;
  }

  try {
    const row = await prisma.board.update({ where: { id }, data: update, select: ADMIN_BOARD_SELECT });
    return toAdminBoard(row, STUB_COUNTS);
  } catch (e) {
    handleWriteError(e);
  }
}

export async function deleteBoard(id: string): Promise<DeleteBoardResult> {
  // migrate to async background job if post count regularly exceeds 1000
  const result = await prisma.$transaction(async (tx) => {
    // TODO: cascade delete votes, comments, posts when Post model is added
    // const votes = await tx.vote.deleteMany({ where: { post: { boardId: id } } });
    // const comments = await tx.comment.deleteMany({ where: { post: { boardId: id } } });
    // const posts = await tx.post.deleteMany({ where: { boardId: id } });
    const board = await tx.board.delete({ where: { id }, select: { id: true, slug: true } });
    return { board, posts: 0, votes: 0, comments: 0 };
  });
  return {
    id: result.board.id,
    slug: result.board.slug,
    deletedCounts: { posts: result.posts, votes: result.votes, comments: result.comments },
  };
}

// TODO v1.1: verify all board IDs exist and belong to the
// current workspace before reordering — required when per-board
// roles are introduced (DECISION-01 follow-up)
export async function reorderBoards(updates: Array<{ id: string; position: number }>): Promise<void> {
  await prisma.$transaction(
    updates.map(({ id, position }) => prisma.board.update({ where: { id }, data: { position } })),
  );
}
