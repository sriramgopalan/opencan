import { PostStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { sendStatusChangeEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { isEnabled } from "@/lib/flags";
import { logger } from "@/lib/logger";
import { stripHtml } from "@/lib/sanitize";
import { dispatchWebhook } from "@/lib/webhook";
import {
  createPost,
  deletePost,
  getPostAuthorForNotification,
  getSimilarPosts,
  getPostById,
  listPosts,
  setPostPin,
  setPostStatus,
  toggleVote,
  updatePost,
} from "@/server/repositories/post";
import { enforceWhoCanPost, getViewer, maskForbiddenAsNotFound, requireBoardVisible } from "@/server/routers/_helpers";
import {
  adminProcedure,
  applyRateLimit,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/trpc";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreatePostInput = z
  .object({
    boardId: z.string().cuid(),
    title: z.string().trim().min(5, "Title must be at least 5 characters.").max(150, "Title must be 150 characters or fewer."),
    description: z.string().trim().max(2000, "Description must be 2 000 characters or fewer.").optional(),
    guestName: z.string().trim().min(2, "Guest name must be at least 2 characters.").max(50, "Guest name must be 50 characters or fewer.").optional(),
  })
  .strict();

const UpdatePostInput = z
  .object({
    id: z.string().cuid(),
    title: z.string().trim().min(5, "Title must be at least 5 characters.").max(150, "Title must be 150 characters or fewer.").optional(),
    description: z.string().trim().max(2000, "Description must be 2 000 characters or fewer.").nullish(),
  })
  .strict();

const ListPostsInput = z
  .object({
    boardId: z.string().cuid(),
    status: z
      .array(
        z.enum([
          "OPEN",
          "UNDER_REVIEW",
          "PLANNED",
          "IN_PROGRESS",
          "SHIPPED",
          "CLOSED",
        ] as const),
      )
      .optional(),
    orderBy: z.enum(["votes", "newest", "oldest", "status"]).default("votes"),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

const GetSimilarInput = z
  .object({
    boardId: z.string().cuid(),
    title: z.string().trim().min(1).max(150),
  })
  .strict();

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------

async function sendPostStatusNotification(
  postId: string,
  previousStatus: string,
  newStatus: string,
): Promise<void> {
  const ctx = await getPostAuthorForNotification(postId);
  if (!ctx?.authorEmail) return;
  if (!ctx.notifyOnStatusChange) return;
  const baseUrl = env.AUTH_URL ?? "http://localhost:3000";
  const postUrl = `${baseUrl}/boards/${encodeURIComponent(ctx.boardSlug)}/posts/${ctx.postNumber}`;
  const settingsUrl = `${baseUrl}/settings`;
  await sendStatusChangeEmail(ctx.authorEmail, ctx.title, previousStatus, newStatus, postUrl, settingsUrl);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const postRouter = createTRPCRouter({
  create: publicProcedure.input(CreatePostInput).mutation(async ({ input, ctx }) => {
    const viewer = getViewer(ctx);
    await applyRateLimit(`posts:create:${viewer.hashedIp}`, 10, 3600);

    const { settings } = await requireBoardVisible(input.boardId, viewer.isAdmin, "posts.create");
    const { whoCanPost, postModerationEnabled } = settings;

    enforceWhoCanPost(whoCanPost, viewer, !!input.guestName, "posts.create");

    const initialStatus: PostStatus = postModerationEnabled ? PostStatus.PENDING : PostStatus.OPEN;

    try {
      const result = await createPost({
        boardId: input.boardId,
        authorId: viewer.callerId ?? null,
        guestName: input.guestName ? stripHtml(input.guestName) : null,
        title: stripHtml(input.title),
        description: input.description ? stripHtml(input.description) : null,
        initialStatus,
      });
      dispatchWebhook("post.created", {
        id: result.id,
        postNumber: result.postNumber,
        boardId: result.boardId,
        title: result.title,
        status: result.status,
        authorId: result.authorId,
        createdAt: result.createdAt,
      }).catch((err: unknown) => logger.error({ err, postId: result.id }, "webhook dispatch failed"));
      return result;
    } catch (e) {
      if (e instanceof AppError) {
        throw new TRPCError({ code: "CONFLICT", cause: e });
      }
      logger.error({ err: e, boardId: input.boardId }, "posts.create: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong. Please try again."),
      });
    }
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .query(async ({ input, ctx }) => {
      const viewer = getViewer(ctx);
      try {
        const post = await getPostById(input.id, viewer);
        if (!post) {
          logger.info({ postId: input.id }, "posts.getById: not found or not visible");
          throw new TRPCError({
            code: "NOT_FOUND",
            cause: new AppError("NOT_FOUND", "This post doesn't exist."),
          });
        }
        return post;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        logger.error({ err: e }, "posts.getById: db error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
        });
      }
    }),

  update: protectedProcedure.input(UpdatePostInput).mutation(async ({ input, ctx }) => {
    const viewer = getViewer(ctx);
    const { id, ...data } = input;
    const callerId = ctx.session.user.id;

    await applyRateLimit(`posts:update:${viewer.hashedIp}`, 20, 3600);

    try {
      const post = await updatePost(
        id,
        {
          title: data.title !== undefined ? stripHtml(data.title) : undefined,
          description: data.description != null ? stripHtml(data.description) : data.description,
        },
        { isAdmin: viewer.isAdmin, callerId },
      );

      if (!viewer.isAdmin) {
        const { id: postId, postNumber, boardId, guestName, title, description, status, isPinned, voteCount, hasVoted, createdAt } = post;
        return { id: postId, postNumber, boardId, guestName, title, description, status, isPinned, voteCount, hasVoted, createdAt };
      }
      return post;
    } catch (e) {
      if (e instanceof AppError) {
        if (e.code === "NOT_FOUND") {
          logger.info({ postId: id, userId: callerId }, "posts.update: not found");
          throw new TRPCError({ code: "NOT_FOUND", cause: e });
        }
        if (e.code === "FORBIDDEN") {
          maskForbiddenAsNotFound(e, id, callerId, "posts.update");
        }
        if (e.code === "VALIDATION_ERROR") {
          logger.info({ postId: id, userId: callerId, status: (e.meta as { status?: PostStatus } | undefined)?.status }, "posts.update: locked status");
          throw new TRPCError({ code: "BAD_REQUEST", cause: e });
        }
      }
      logger.error({ err: e, postId: id }, "posts.update: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .mutation(async ({ input }) => {
      try {
        return await deletePost(input.id);
      } catch (e) {
        if (
          e instanceof Error &&
          "code" in e &&
          (e as { code?: string }).code === "P2025"
        ) {
          logger.info({ postId: input.id }, "posts.delete: not found");
          throw new TRPCError({
            code: "NOT_FOUND",
            cause: new AppError("NOT_FOUND", "Post not found."),
          });
        }
        logger.error({ err: e, postId: input.id }, "posts.delete: db error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new AppError("INTERNAL_ERROR", "Something went wrong. The post was not deleted."),
        });
      }
    }),

  list: publicProcedure.input(ListPostsInput).query(async ({ input, ctx }) => {
    const viewer = getViewer(ctx);
    await requireBoardVisible(input.boardId, viewer.isAdmin, "posts.list");

    try {
      return await listPosts({
        boardId: input.boardId,
        statusFilter: input.status as PostStatus[] | undefined,
        orderBy: input.orderBy,
        cursor: input.cursor,
        limit: input.limit,
        isAdmin: viewer.isAdmin,
        callerId: viewer.callerId,
        hashedIp: viewer.hashedIp,
      });
    } catch (e) {
      if (e instanceof AppError && e.code === "VALIDATION_ERROR") {
        throw new TRPCError({ code: "BAD_REQUEST", cause: e });
      }
      logger.error({ err: e, boardId: input.boardId }, "posts.list: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  setStatus: adminProcedure
    .input(
      z
        .object({
          id: z.string().cuid(),
          status: z.enum([
            "OPEN",
            "UNDER_REVIEW",
            "PLANNED",
            "IN_PROGRESS",
            "SHIPPED",
            "CLOSED",
          ] as const),
        })
        .strict(),
    )
    .mutation(async ({ input, ctx }) => {
      await applyRateLimit(`posts:setStatus:${ctx.session.user.id}`, 100, 3600);

      const post = await setPostStatus(input.id, input.status as PostStatus);
      if (!post) {
        logger.info({ postId: input.id }, "posts.setStatus: not found");
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "Post not found."),
        });
      }
      if (isEnabled("STATUS_NOTIFICATIONS") && post.status !== post.previousStatus) {
        sendPostStatusNotification(input.id, post.previousStatus, post.status).catch(
          (err: unknown) => logger.error({ err, postId: input.id }, "status notification failed"),
        );
      }
      if (post.status !== post.previousStatus) {
        dispatchWebhook("post.status_changed", {
          id: post.id,
          postNumber: post.postNumber,
          boardId: post.boardId,
          title: post.title,
          previousStatus: post.previousStatus,
          status: post.status,
        }).catch((err: unknown) => logger.error({ err, postId: input.id }, "webhook dispatch failed"));
      }
      return post;
    }),

  setPin: adminProcedure
    .input(z.object({ id: z.string().cuid(), pinned: z.boolean() }).strict())
    .mutation(async ({ input, ctx }) => {
      await applyRateLimit(`posts:setPin:${ctx.session.user.id}`, 100, 3600);
      const post = await setPostPin(input.id, input.pinned);
      if (!post) {
        logger.info({ postId: input.id }, "posts.setPin: not found");
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "Post not found."),
        });
      }
      return post;
    }),

  toggleVote: publicProcedure
    .input(z.object({ postId: z.string().cuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      const viewer = getViewer(ctx);
      await applyRateLimit(`posts:vote:${viewer.hashedIp}`, 60, 60);

      const post = await getPostById(input.postId, {
        isAdmin: viewer.isAdmin,
        callerId: viewer.callerId,
        hashedIp: viewer.hashedIp,
      });
      if (!post) {
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "Post not found."),
        });
      }

      const { settings } = await requireBoardVisible(post.boardId, viewer.isAdmin, "posts.toggleVote");

      if (!viewer.callerId) {
        if (!settings.guestVotingEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            cause: new AppError("FORBIDDEN", "Guest voting is not enabled for this board."),
          });
        }
      }

      try {
        return await toggleVote(input.postId, {
          userId: viewer.callerId,
          hashedIp: viewer.hashedIp,
          boardId: post.boardId,
        });
      } catch (e) {
        if (e instanceof AppError) {
          const code = e.code === "FORBIDDEN" ? "FORBIDDEN" : "BAD_REQUEST";
          throw new TRPCError({ code, cause: e });
        }
        logger.error({ err: e, postId: input.postId }, "posts.toggleVote: error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
        });
      }
    }),

  getSimilar: publicProcedure.input(GetSimilarInput).query(async ({ input, ctx }) => {
    const viewer = getViewer(ctx);
    await applyRateLimit(`posts:similar:${viewer.hashedIp}`, 30, 60);
    await requireBoardVisible(input.boardId, viewer.isAdmin, "posts.getSimilar");

    try {
      const items = await getSimilarPosts(input.boardId, input.title);
      return { items };
    } catch (e) {
      logger.error({ err: e, boardId: input.boardId }, "posts.getSimilar: error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),
});
