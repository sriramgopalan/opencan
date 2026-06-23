import { randomBytes } from "crypto";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { prisma } from "@/server/db";
import type { WebhookCreated, WebhookEvent, WebhookListItem } from "@/types/webhook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toListItem(row: {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
}): WebhookListItem {
  return {
    id: row.id,
    url: row.url,
    secretPreview: row.secret.slice(-4),
    events: row.events as WebhookEvent[],
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export async function listWebhooks(): Promise<WebhookListItem[]> {
  const rows = await prisma.webhook.findMany({
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toListItem);
}

export async function getActiveWebhooksForEvent(event: WebhookEvent): Promise<{ id: string; url: string; secret: string }[]> {
  const rows = await prisma.webhook.findMany({
    where: { isActive: true },
    select: { id: true, url: true, secret: true, events: true },
  });
  return rows.filter((r) => r.events.includes(event));
}

export async function createWebhook(input: {
  url: string;
  events: WebhookEvent[];
}): Promise<WebhookCreated> {
  const count = await prisma.webhook.count();
  if (count >= env.WEBHOOK_MAX) {
    throw new AppError("CONFLICT", `Maximum of ${env.WEBHOOK_MAX} webhooks allowed.`);
  }

  const secret = randomBytes(32).toString("hex");
  const row = await prisma.webhook.create({
    data: {
      url: input.url,
      secret,
      events: input.events,
    },
  });

  return {
    ...toListItem(row),
    secret,
  };
}

export async function deleteWebhook(id: string): Promise<{ id: string }> {
  const existing = await prisma.webhook.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError("NOT_FOUND", "Webhook not found.");
  await prisma.webhook.delete({ where: { id } });
  return { id };
}
