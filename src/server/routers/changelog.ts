import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { sendChangelogNotification } from "@/lib/email";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { isEnabled } from "@/lib/flags";
import { logger } from "@/lib/logger";
import { isSlugFormatValid } from "@/lib/slug";
import {
  createChangelogEntry,
  deleteChangelogEntry,
  getChangelogEntryById,
  getChangelogEntryBySlug,
  getVoterEmailsForPosts,
  listAllChangelogEntries,
  listChangelogEntries,
  publishChangelogEntry,
  updateChangelogEntry,
} from "@/server/repositories/changelog";
import { adminProcedure, applyRateLimit, createTRPCRouter, publicProcedure } from "@/server/trpc";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const slugSchema = z
  .string()
  .trim()
  .refine((v) => isSlugFormatValid(v), {
    message: "Slug must be 3–50 lowercase alphanumeric characters or hyphens, starting with a letter.",
  });

const ListInput = z
  .object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

const CreateInput = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(50000),
    linkedPostIds: z.array(z.string().cuid()).max(50).default([]),
  })
  .strict();

const UpdateInput = z
  .object({
    id: z.string().cuid(),
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(50000).optional(),
    linkedPostIds: z.array(z.string().cuid()).max(50).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const changelogRouter = createTRPCRouter({
  list: publicProcedure.input(ListInput).query(async ({ input }) => {
    if (!isEnabled("CHANGELOG")) {
      return { items: [], nextCursor: null };
    }
    try {
      return await listChangelogEntries({ cursor: input.cursor, limit: input.limit });
    } catch (e) {
      if (e instanceof AppError && e.code === "VALIDATION_ERROR") {
        throw new TRPCError({ code: "BAD_REQUEST", cause: e });
      }
      logger.error({ err: e }, "changelog.list: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  get: publicProcedure
    .input(z.object({ slug: slugSchema }).strict())
    .query(async ({ input }) => {
      if (!isEnabled("CHANGELOG")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "Not found."),
        });
      }
      const entry = await getChangelogEntryBySlug(input.slug);
      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "Changelog entry not found."),
        });
      }
      return entry;
    }),

  listAll: adminProcedure.input(ListInput).query(async ({ input }) => {
    try {
      return await listAllChangelogEntries({ cursor: input.cursor, limit: input.limit });
    } catch (e) {
      if (e instanceof AppError && e.code === "VALIDATION_ERROR") {
        throw new TRPCError({ code: "BAD_REQUEST", cause: e });
      }
      logger.error({ err: e }, "changelog.listAll: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  create: adminProcedure.input(CreateInput).mutation(async ({ input, ctx }) => {
    await applyRateLimit(`changelog:create:${ctx.session.user.id}`, 20, 3600);
    try {
      return await createChangelogEntry({
        slug: input.slug,
        title: input.title,
        body: input.body,
        authorId: ctx.session.user.id,
        linkedPostIds: input.linkedPostIds,
      });
    } catch (e) {
      if (e instanceof AppError && e.code === "CONFLICT") {
        throw new TRPCError({ code: "CONFLICT", cause: e });
      }
      logger.error({ err: e }, "changelog.create: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  update: adminProcedure.input(UpdateInput).mutation(async ({ input, ctx }) => {
    await applyRateLimit(`changelog:update:${ctx.session.user.id}`, 60, 3600);
    const { id, ...data } = input;
    try {
      return await updateChangelogEntry(id, data);
    } catch (e) {
      if (e instanceof AppError) {
        if (e.code === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", cause: e });
        if (e.code === "CONFLICT") throw new TRPCError({ code: "CONFLICT", cause: e });
      }
      logger.error({ err: e, entryId: id }, "changelog.update: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  publish: adminProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      await applyRateLimit(`changelog:publish:${ctx.session.user.id}`, 20, 3600);
      let result: Awaited<ReturnType<typeof publishChangelogEntry>>;
      try {
        result = await publishChangelogEntry(input.id);
      } catch (e) {
        if (e instanceof AppError) {
          if (e.code === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", cause: e });
          if (e.code === "CONFLICT") throw new TRPCError({ code: "CONFLICT", cause: e });
        }
        logger.error({ err: e, entryId: input.id }, "changelog.publish: db error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
        });
      }

      // Fire-and-forget notification fan-out
      const { id: entryId, linkedPostIds } = result;
      if (linkedPostIds.length > 0) {
        const entry = await getChangelogEntryById(entryId);
        const entryTitle = entry?.title ?? "New changelog entry";
        const baseUrl = env.AUTH_URL ?? "http://localhost:3000";
        const entryUrl = `${baseUrl}/changelog/${entry?.slug ?? entryId}`;
        getVoterEmailsForPosts(linkedPostIds)
          .then((emails) =>
            Promise.allSettled(
              emails.map((to) =>
                sendChangelogNotification(to, entryTitle, entryUrl).catch((err) =>
                  logger.error({ err, to }, "changelog.publish: email failed"),
                ),
              ),
            ),
          )
          .catch((err) => logger.error({ err, entryId }, "changelog.publish: fan-out failed"));
      }

      return { id: entryId, publishedAt: result.publishedAt };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      await applyRateLimit(`changelog:delete:${ctx.session.user.id}`, 20, 3600);
      try {
        return await deleteChangelogEntry(input.id);
      } catch (e) {
        if (e instanceof AppError && e.code === "NOT_FOUND") {
          throw new TRPCError({ code: "NOT_FOUND", cause: e });
        }
        logger.error({ err: e, entryId: input.id }, "changelog.delete: db error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
        });
      }
    }),
});
