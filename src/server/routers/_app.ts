import { authRouter } from "@/server/routers/auth";
import { boardRouter } from "@/server/routers/board";
import { postRouter } from "@/server/routers/post";
import { createTRPCRouter } from "@/server/trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  boards: boardRouter,
  posts: postRouter,
});

export type AppRouter = typeof appRouter;
