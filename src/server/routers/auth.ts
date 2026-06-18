import { hash, verify } from "@node-rs/argon2";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { issueEmailVerification } from "@/lib/auth-helpers";
import {
  sendAccountDeletedEmail,
  sendMagicLinkEmail,
  sendPasswordChangedEmail,
} from "@/lib/email";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { invalidateAllUserSessionCaches } from "@/server/repositories/session";
import {
  createUser,
  deleteUserAccount,
  getProviderForEmail,
  getUserByEmail,
  getUserWithPasswordHash,
  incrementFailedLoginCount,
  lockAccount,
  resetFailedLoginCount,
  updatePasswordHash,
} from "@/server/repositories/user";
import {
  TOKEN_TYPES,
  createVerificationToken,
  generateToken,
} from "@/server/repositories/verificationToken";
import {
  applyRateLimit,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/trpc";

const PASSWORD_MIN_LENGTH = 12;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);

export const authRouter = createTRPCRouter({
  requestMagicLink: publicProcedure
    .input(z.object({ email: z.string().email() }).strict())
    .output(z.object({ sent: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      // IP rate limit: 10 requests per hour
      await applyRateLimit(`auth:ip:${ctx.ip}`, 10, 3600);
      // Per-email rate limit: 5 per 10 minutes
      await applyRateLimit(`auth:email:${input.email}`, 5, 600);

      // Auto-register if no account exists
      let user = await getUserByEmail(input.email);
      if (!user) {
        user = await createUser({ email: input.email });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await createVerificationToken({
        identifier: input.email,
        token,
        expiresAt,
        type: TOKEN_TYPES.MAGIC_LINK,
      });

      const baseUrl = env.AUTH_URL ?? "http://localhost:3000";
      const magicLinkUrl = `${baseUrl}/auth/magic-link?token=${token}&email=${encodeURIComponent(input.email)}`;

      // Best-effort — do not block on email failure
      sendMagicLinkEmail(input.email, magicLinkUrl).catch((err: unknown) => {
        logger.error({ err, userId: user?.id }, "magic link email failed");
      });

      logger.info({ ip: ctx.ip }, "magic link requested");
      return { sent: true as const };
    }),

  changePassword: protectedProcedure
    .input(
      z
        .object({
          currentPassword: z.string().min(1),
          newPassword: passwordSchema,
        })
        .strict(),
    )
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const user = await getUserWithPasswordHash(ctx.session.user.email ?? "");
      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          cause: new AppError(
            "VALIDATION_ERROR",
            "No password set on this account. Use OAuth sign-in.",
          ),
        });
      }

      const valid = await verify(user.passwordHash, input.currentPassword);
      if (!valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          cause: new AppError("VALIDATION_ERROR", "Current password is incorrect"),
        });
      }

      const newHash = await hash(input.newPassword);

      // Invalidate all sessions (including current) before updating password
      const sessions = await prisma.session.findMany({
        where: { userId },
        select: { sessionToken: true },
      });
      await invalidateAllUserSessionCaches(userId);
      await prisma.$transaction([
        prisma.session.deleteMany({ where: { userId } }),
        prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } }),
      ]);

      logger.info({ ip: ctx.ip, userId }, "password changed");

      sendPasswordChangedEmail(ctx.session.user.email ?? "").catch(
        (err: unknown) => {
          logger.error({ err, userId }, "password changed email failed");
        },
      );

      void sessions; // sessions variable used above for Redis cleanup
      return { success: true as const };
    }),

  deleteAccount: protectedProcedure
    .input(
      z
        .object({ confirmation: z.literal("delete my account") })
        .strict(),
    )
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const email = ctx.session.user.email ?? "";

      await invalidateAllUserSessionCaches(userId);
      await deleteUserAccount(userId, email);

      logger.info({ userId }, "account deleted");

      sendAccountDeletedEmail(email).catch((err: unknown) => {
        logger.error({ err, userId }, "account deleted email failed");
      });

      return { success: true as const };
    }),

  resendVerification: protectedProcedure
    .input(z.object({}).strict())
    .output(z.object({ sent: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      const email = ctx.session.user.email ?? "";

      await applyRateLimit(`auth:email:${email}`, 5, 600);

      await issueEmailVerification(email, ctx.session.user.id);

      return { sent: true as const };
    }),
});

export { updatePasswordHash, getUserWithPasswordHash, getProviderForEmail, resetFailedLoginCount, incrementFailedLoginCount, lockAccount, MAX_FAILED_LOGINS, LOCKOUT_MINUTES };
