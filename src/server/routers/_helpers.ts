import { TRPCError } from "@trpc/server";

import type { BoardSettings } from "@/lib/board-settings";
import { AppError } from "@/lib/errors";
import { hashIp } from "@/lib/ip-hash";
import { logger } from "@/lib/logger";
import { getBoardById } from "@/server/repositories/board";
import type { PostViewer } from "@/types/post";

export function getViewer(
  ctx: { session: { user: { id: string; role: string } } | null; ip: string },
): PostViewer {
  return {
    isAdmin: ctx.session?.user?.role === "ADMIN",
    callerId: ctx.session?.user?.id,
    hashedIp: hashIp(ctx.ip),
  };
}

export async function requireBoardVisible(
  boardId: string,
  isAdmin: boolean,
  context: string,
): Promise<{ settings: BoardSettings; isPublic: boolean }> {
  const board = await getBoardById(boardId);
  if (!board) {
    logger.info({ boardId }, context + ": board not found");
    throw new TRPCError({
      code: "NOT_FOUND",
      cause: new AppError("NOT_FOUND", "This board doesn't exist."),
    });
  }
  if (!board.isPublic && !isAdmin) {
    logger.info({ boardId }, context + ": private board blocked non-admin");
    throw new TRPCError({
      code: "NOT_FOUND",
      cause: new AppError("NOT_FOUND", "This board doesn't exist."),
    });
  }
  return { settings: board.settings, isPublic: board.isPublic };
}

export function enforceWhoCanPost(
  whoCanPost: BoardSettings["whoCanPost"],
  viewer: PostViewer,
  hasGuestName: boolean,
  context: string,
): void {
  if (whoCanPost === "ADMINS_ONLY" && !viewer.isAdmin) {
    logger.info({ context }, `${context}: ADMINS_ONLY blocked`);
    throw new TRPCError({
      code: "NOT_FOUND",
      cause: new AppError("NOT_FOUND", "This board only accepts posts from registered users."),
    });
  }
  if (whoCanPost === "AUTHENTICATED" && !viewer.callerId) {
    logger.info({ context }, `${context}: unauthenticated blocked`);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      cause: new AppError("UNAUTHORIZED", "You must be signed in to post."),
    });
  }
  if (!viewer.callerId && !hasGuestName) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      cause: new AppError("VALIDATION_ERROR", "A guest name is required."),
    });
  }
}

export function maskForbiddenAsNotFound(
  e: unknown,
  resourceId: string,
  userId: string,
  context: string,
): never {
  logger.warn({ resourceId, userId, err: e }, `${context}: not author`);
  throw new TRPCError({
    code: "NOT_FOUND",
    cause: new AppError("NOT_FOUND", "Not found."),
  });
}
