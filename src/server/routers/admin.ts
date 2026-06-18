import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { addToBlocklist, removeFromBlocklist } from "@/lib/session-blocklist";
import { prisma } from "@/server/db";
import { getWorkspaceStats, listAdminUsers } from "@/server/repositories/admin";
import { invalidateAllUserSessionCaches } from "@/server/repositories/session";
import {
  adminDeleteUser,
  getUserRoleAndStatus,
  setUserRole,
  suspendUser,
  unsuspendUser,
} from "@/server/repositories/user";
import { adminProcedure, applyRateLimit, createTRPCRouter } from "@/server/trpc";

// Rate-limited base for all admin state mutations (60 per 60 s per admin).
const adminMutationProcedure = adminProcedure.use(async ({ ctx, next }) => {
  await applyRateLimit(`admin:mutations:${ctx.session.user.id}`, 60, 60);
  return next({ ctx });
});

async function requireUser(userId: string) {
  const user = await getUserRoleAndStatus(userId);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
  return user;
}

export const adminRouter = createTRPCRouter({
  getStats: adminProcedure
    .output(
      z.object({
        totalBoards: z.number(),
        totalPosts: z.number(),
        totalVotes: z.number(),
        totalComments: z.number(),
        totalUsers: z.number(),
        newPostsLast30Days: z.number(),
        newUsersLast30Days: z.number(),
      }),
    )
    .query(async () => {
      return getWorkspaceStats();
    }),

  listUsers: adminProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
          search: z
            .string()
            .trim()
            .max(255)
            .transform((v) => v || undefined)
            .optional(),
        })
        .strict(),
    )
    .query(async ({ input }) => {
      return listAdminUsers(input);
    }),

  updateUserRole: adminMutationProcedure
    .input(
      z
        .object({
          userId: z.string().cuid(),
          role: z.enum(["ADMIN", "MEMBER"]),
        })
        .strict(),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role.",
        });
      }

      const user = await requireUser(input.userId);

      if (user.role === input.role) {
        logger.debug(
          { adminId: ctx.session.user.id, targetUserId: input.userId, reason: "no-op" },
          "admin: no-op skipped",
        );
        return { id: user.id, role: user.role };
      }

      const oldRole = user.role;
      const updated = await setUserRole(input.userId, input.role);
      await addToBlocklist(input.userId);

      logger.info(
        { adminId: ctx.session.user.id, targetUserId: input.userId, oldRole, newRole: input.role },
        "admin: role updated",
      );

      return updated;
    }),

  suspendUser: adminMutationProcedure
    .input(z.object({ userId: z.string().cuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot suspend your own account.",
        });
      }

      const user = await requireUser(input.userId);

      if (user.role === "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot suspend an admin account.",
        });
      }

      if (user.suspendedAt !== null) {
        logger.debug(
          { adminId: ctx.session.user.id, targetUserId: input.userId, reason: "no-op" },
          "admin: no-op skipped",
        );
        return { id: user.id, suspendedAt: user.suspendedAt };
      }

      const updated = await suspendUser(input.userId);
      await addToBlocklist(input.userId);

      logger.info(
        { adminId: ctx.session.user.id, targetUserId: input.userId },
        "admin: user suspended",
      );

      return updated;
    }),

  unsuspendUser: adminMutationProcedure
    .input(z.object({ userId: z.string().cuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot unsuspend yourself.",
        });
      }

      const user = await requireUser(input.userId);

      if (user.suspendedAt === null) {
        logger.debug(
          { adminId: ctx.session.user.id, targetUserId: input.userId, reason: "no-op" },
          "admin: no-op skipped",
        );
        return { id: user.id, suspendedAt: null as null };
      }

      const updated = await unsuspendUser(input.userId);
      await removeFromBlocklist(input.userId);

      logger.info(
        { adminId: ctx.session.user.id, targetUserId: input.userId },
        "admin: user unsuspended",
      );

      return updated;
    }),

  deleteUser: adminMutationProcedure
    .input(
      z
        .object({
          userId: z.string().cuid(),
          confirmEmail: z.string().email(),
        })
        .strict(),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Use your account settings to delete your own account.",
        });
      }

      const user = await requireUser(input.userId);

      if (user.role === "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete an admin account via the admin panel.",
        });
      }
      if (user.email !== input.confirmEmail) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email does not match. Please type the user's email exactly.",
        });
      }

      const boardCount = await prisma.board.count({ where: { ownerId: input.userId } });
      if (boardCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `User owns ${boardCount} board(s). Reassign or delete them first.`,
        });
      }

      await addToBlocklist(input.userId);
      await invalidateAllUserSessionCaches(input.userId);
      await adminDeleteUser(input.userId);

      logger.info(
        { adminId: ctx.session.user.id, targetUserId: input.userId },
        "admin: user deleted",
      );

      return { id: input.userId };
    }),
});
