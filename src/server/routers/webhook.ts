import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { testWebhookDelivery } from "@/lib/webhook";
import { prisma } from "@/server/db";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
} from "@/server/repositories/webhook";
import { adminProcedure, createTRPCRouter } from "@/server/trpc";
import type { WebhookEvent } from "@/types/webhook";
import { WEBHOOK_EVENTS } from "@/types/webhook";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateWebhookInput = z
  .object({
    url: z.string().url("Must be a valid URL.").max(500, "URL must be 500 characters or fewer."),
    events: z
      .array(z.enum(WEBHOOK_EVENTS as [string, ...string[]]))
      .min(1, "At least one event must be selected.")
      .max(WEBHOOK_EVENTS.length),
  })
  .strict();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const webhookRouter = createTRPCRouter({
  list: adminProcedure.query(async () => {
    try {
      return await listWebhooks();
    } catch (e) {
      logger.error({ err: e }, "webhooks.list: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  create: adminProcedure.input(CreateWebhookInput).mutation(async ({ input, ctx }) => {
    try {
      const webhook = await createWebhook({
        url: input.url,
        events: input.events as WebhookEvent[],
      });
      logger.info({ webhookId: webhook.id, userId: ctx.session.user.id }, "webhook created");
      return webhook;
    } catch (e) {
      if (e instanceof AppError && e.code === "CONFLICT") {
        throw new TRPCError({ code: "CONFLICT", cause: e });
      }
      logger.error({ err: e }, "webhooks.create: db error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
      });
    }
  }),

  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await deleteWebhook(input.id);
        logger.info({ webhookId: input.id, userId: ctx.session.user.id }, "webhook deleted");
        return result;
      } catch (e) {
        if (e instanceof AppError && e.code === "NOT_FOUND") {
          throw new TRPCError({ code: "NOT_FOUND", cause: e });
        }
        logger.error({ err: e, webhookId: input.id }, "webhooks.delete: db error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new AppError("INTERNAL_ERROR", "Something went wrong."),
        });
      }
    }),

  test: adminProcedure
    .input(z.object({ id: z.string().cuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      const row = await prisma.webhook.findUnique({
        where: { id: input.id },
        select: { id: true, url: true, secret: true },
      });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new AppError("NOT_FOUND", "Webhook not found."),
        });
      }
      logger.info({ webhookId: input.id, userId: ctx.session.user.id }, "webhook test requested");
      return testWebhookDelivery(row);
    }),
});
