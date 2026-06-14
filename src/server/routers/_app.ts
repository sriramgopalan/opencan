import { authRouter } from "@/server/routers/auth";
import { boardRouter } from "@/server/routers/board";
import { createTRPCRouter } from "@/server/trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  boards: boardRouter,
});

export type AppRouter = typeof appRouter;
