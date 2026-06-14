import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { BoardSettingsSchema } from "@/lib/board-settings";
import { AppError } from "@/lib/errors";
import {
  generateRandomSuffix,
  generateSlugFromName,
  isSlugFormatValid,
  isSlugReserved,
} from "@/lib/slug";
import {
  checkSlugAvailable,
  createBoard,
  deleteBoard,
  getBoardById,
  getBoardBySlug,
  getBoardBySlugAdmin,
  listBoards,
  reorderBoards,
  updateBoard,
} from "@/server/repositories/board";
import { adminProcedure, createTRPCRouter, publicProcedure } from "@/server/trpc";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const SlugSchema = z
  .string()
  .min(3, "URL must be at least 3 characters")
  .max(50, "URL must be at most 50 characters")
  .regex(/^[a-z0-9-]+$/, "URL may only contain lowercase letters, numbers, and hyphens");

const CreateBoardInput = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().max(500).optional(),
    slug: SlugSchema.optional(),
    isPublic: z.boolean().default(false),
    isListed: z.boolean().default(false),
    settings: BoardSettingsSchema.partial().optional(),
  })
  .strict();

const UpdateBoardInput = z
  .object({
    id: z.string().cuid(),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    slug: SlugSchema.optional(),
    isPublic: z.boolean().optional(),
    isListed: z.boolean().optional(),
    settings: BoardSettingsSchema.partial().optional(),
  })
  .strict();

const DeleteBoardInput = z
  .object({
    id: z.string().cuid(),
    confirmSlug: z.string(),
  })
  .strict();

const ListBoardsInput = z
  .object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    orderBy: z.enum(["name", "createdAt", "postCount"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().max(200).optional(),
  })
  .strict()
  .optional();

const ReorderInput = z
  .object({
    updates: z
      .array(z.object({ id: z.string().cuid(), position: z.number().int().min(0) }))
      .min(1)
      .max(100),
  })
  .strict();

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function assertValidVisibility(isPublic: boolean, isListed: boolean): void {
  if (isListed && !isPublic) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      cause: new AppError(
        "VALIDATION_ERROR",
        "A board cannot be listed without also being public.",
      ),
    });
  }
}

// ---------------------------------------------------------------------------
// Slug resolution
// ---------------------------------------------------------------------------

async function validateExplicitSlug(slug: string, excludeId?: string): Promise<void> {
  if (!isSlugFormatValid(slug)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      cause: new AppError(
        "VALIDATION_ERROR",
        "URL must be 3–50 characters, start with a letter, and use only lowercase letters, numbers, and single hyphens.",
      ),
    });
  }
  if (isSlugReserved(slug)) {
    throw new TRPCError({
      code: "CONFLICT",
      cause: new AppError("CONFLICT", "That URL is reserved and cannot be used."),
    });
  }
  const available = await checkSlugAvailable(slug, excludeId);
  if (!available) {
    throw new TRPCError({
      code: "CONFLICT",
      cause: new AppError(
        "CONFLICT",
        "That URL was just taken. Please try again or choose another.",
      ),
    });
  }
}

async function autoGenerateSlug(name: string, excludeId?: string): Promise<string> {
  const base = generateSlugFromName(name);
  const sanitized = isSlugFormatValid(base) && !isSlugReserved(base) ? base : null;
  if (sanitized && (await checkSlugAvailable(sanitized, excludeId))) {
    return sanitized;
  }
  const prefix = (sanitized ?? base).slice(0, 45) || "board";
  for (let i = 0; i < 5; i++) {
    const candidate = `${prefix}-${generateRandomSuffix()}`;
    if (isSlugFormatValid(candidate) && (await checkSlugAvailable(candidate, excludeId))) {
      return candidate;
    }
  }
  throw new TRPCError({
    code: "CONFLICT",
    cause: new AppError(
      "CONFLICT",
      "Could not generate a unique URL. Please provide one manually.",
    ),
  });
}

async function resolveSlug(
  name: string,
  explicitSlug: string | undefined,
  excludeId?: string,
): Promise<string> {
  if (explicitSlug) {
    await validateExplicitSlug(explicitSlug, excludeId);
    return explicitSlug;
  }
  return autoGenerateSlug(name, excludeId);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const boardRouter = createTRPCRouter({
  create: adminProcedure.input(CreateBoardInput).mutation(async ({ input, ctx }) => {
    assertValidVisibility(input.isPublic, input.isListed);
    const slug = await resolveSlug(input.name, input.slug);
    return createBoard({
      slug,
      name: input.name,
      description: input.description,
      isPublic: input.isPublic,
      isListed: input.isListed,
      settings: input.settings,
      ownerId: ctx.session.user.id,
    });
  }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }).strict())
    .query(async ({ input, ctx }) => {
      const slug = input.slug.toLowerCase();
      const isAdmin = ctx.session?.user?.role === "ADMIN";

      if (isAdmin) {
        const board = await getBoardBySlugAdmin(slug);
        if (!board) {
          throw new TRPCError({
            code: "NOT_FOUND",
            cause: new AppError("NOT_FOUND", "This board doesn't exist."),
          });
        }
        return board;
      }

      const board = await getBoardBySlug(slug);
      if (!board) {
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "This board doesn't exist."),
        });
      }
      return board;
    }),

  list: publicProcedure.input(ListBoardsInput).query(async ({ input, ctx }) => {
    const isAdmin = ctx.session?.user?.role === "ADMIN";
    return listBoards({
      adminView: isAdmin,
      page: input?.page,
      limit: input?.limit,
      orderBy: input?.orderBy,
      order: input?.order,
      search: input?.search,
    });
  }),

  update: adminProcedure.input(UpdateBoardInput).mutation(async ({ input }) => {
    const { id, ...data } = input;

    const existing = await getBoardById(id);
    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        cause: new AppError("NOT_FOUND", "Board not found."),
      });
    }

    assertValidVisibility(data.isPublic ?? existing.isPublic, data.isListed ?? existing.isListed);

    const slug = data.slug !== undefined
      ? await resolveSlug(existing.name, data.slug, id)
      : undefined;

    return updateBoard(id, { ...data, slug });
  }),

  updateSettings: adminProcedure
    .input(z.object({ id: z.string().cuid(), settings: BoardSettingsSchema.partial() }).strict())
    .mutation(async ({ input }) => {
      const existing = await getBoardById(input.id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "Board not found."),
        });
      }
      return updateBoard(input.id, { settings: input.settings });
    }),

  delete: adminProcedure.input(DeleteBoardInput).mutation(async ({ input }) => {
    const board = await getBoardById(input.id);
    if (!board) {
      throw new TRPCError({
        code: "NOT_FOUND",
        cause: new AppError("NOT_FOUND", "Board not found."),
      });
    }
    if (board.slug !== input.confirmSlug) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        cause: new AppError(
          "VALIDATION_ERROR",
          "Confirmation does not match the board URL. Please try again.",
        ),
      });
    }
    const result = await deleteBoard(input.id);
    return { ...result, deletedAt: new Date().toISOString() };
  }),

  reorder: adminProcedure.input(ReorderInput).mutation(async ({ input }) => {
    await reorderBoards(input.updates);
    return { updated: input.updates.length };
  }),
});
