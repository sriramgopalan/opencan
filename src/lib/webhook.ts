import { createHmac } from "crypto";

import { isEnabled } from "@/lib/flags";
import { logger } from "@/lib/logger";
import { getActiveWebhooksForEvent } from "@/server/repositories/webhook";
import type { WebhookEvent, WebhookPayload } from "@/types/webhook";

const TIMEOUT_MS = 5_000;

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

async function deliver(
  webhook: { id: string; url: string; secret: string },
  body: string,
): Promise<void> {
  const signature = sign(webhook.secret, body);
  const urlDomain = new URL(webhook.url).hostname; // W-11: log domain only

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenCan-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        logger.warn(
          { webhookId: webhook.id, domain: urlDomain, status: res.status, attempt },
          "webhook delivery: non-2xx response",
        );
      }
      return;
    } catch (err) {
      if (attempt === 2) {
        logger.warn(
          { webhookId: webhook.id, domain: urlDomain, err, attempt },
          "webhook delivery: failed after retry",
        );
      }
    }
  }
}

export async function dispatchWebhook(event: WebhookEvent, data: unknown): Promise<void> {
  if (!isEnabled("WEBHOOKS")) return;

  const webhooks = await getActiveWebhooksForEvent(event);
  if (webhooks.length === 0) return;

  const payload: WebhookPayload = { event, occurredAt: new Date().toISOString(), data };
  const body = JSON.stringify(payload);

  await Promise.allSettled(webhooks.map((wh) => deliver(wh, body)));
}

export async function testWebhookDelivery(webhook: {
  id: string;
  url: string;
  secret: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const payload: WebhookPayload = {
    event: "post.created",
    occurredAt: new Date().toISOString(),
    data: { test: true },
  };
  const body = JSON.stringify(payload);
  const signature = sign(webhook.secret, body);
  const urlDomain = new URL(webhook.url).hostname;

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenCan-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    logger.info({ webhookId: webhook.id, domain: urlDomain, status: res.status }, "webhook test");
    return { ok: res.ok, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.warn({ webhookId: webhook.id, domain: urlDomain, err }, "webhook test failed");
    return { ok: false, error: message };
  }
}
