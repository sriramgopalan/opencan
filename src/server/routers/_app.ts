import { adminRouter } from "@/server/routers/admin";
import { authRouter } from "@/server/routers/auth";
import { boardRouter } from "@/server/routers/board";
import { changelogRouter } from "@/server/routers/changelog";
import { commentRouter } from "@/server/routers/comment";
import { postRouter } from "@/server/routers/post";
import { webhookRouter } from "@/server/routers/webhook";
import { createTRPCRouter } from "@/server/trpc";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  auth: authRouter,
  boards: boardRouter,
  changelog: changelogRouter,
  posts: postRouter,
  comments: commentRouter,
  webhooks: webhookRouter,
});

export type AppRouter = typeof appRouter;
