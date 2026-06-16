import { TRPCError, initTRPC } from "@trpc/server";
import type { Session } from "next-auth";
import superjson from "superjson";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";


export type Context = {
  session: Session | null;
  ip: string;
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    if (cause instanceof AppError) {
      return {
        ...shape,
        message: cause.message,
        data: { ...shape.data, appErrorCode: cause.code },
      };
    }
    if (error.code === "INTERNAL_SERVER_ERROR") {
      logger.error({ err: error }, "unhandled tRPC error");
      return { ...shape, message: "An unexpected error occurred" };
    }
    return shape;
  },
});

type AuthedSession = Session & { user: NonNullable<Session["user"]> & { id: string } };

const authMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      cause: new AppError("UNAUTHORIZED", "Not authenticated"),
    });
  }
  return next({
    ctx: { ...ctx, session: ctx.session as AuthedSession },
  });
});

const adminMiddleware = t.middleware(({ ctx, next }) => {
  const session = ctx.session as AuthedSession;
  if (session.user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      cause: new AppError("FORBIDDEN", "Admin access required"),
    });
  }
  return next({ ctx: { ...ctx, session } });
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(authMiddleware);
export const adminProcedure = protectedProcedure.use(adminMiddleware);

export async function applyRateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  try {
    await rateLimit(key, { max, windowSeconds });
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", cause: e });
    }
    throw e;
  }
}
