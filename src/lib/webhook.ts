import { createHmac } from "crypto";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getActiveWebhooksForEvent } from "@/server/repositories/webhook";
import type { WebhookEndpoint, WebhookEvent, WebhookPayload } from "@/types/webhook";
import { WEBHOOK_EVENTS } from "@/types/webhook";

const TIMEOUT_MS = 5_000;

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;
  // IPv6 loopback / link-local
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (bare === "::1" || bare.startsWith("fe80:")) return true;
  // IPv4 private ranges
  const octets = hostname.split(".").map(Number);
  if (octets.length === 4 && !octets.some(isNaN)) {
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return false;
}

async function sendRequest(webhook: WebhookEndpoint, body: string, signature: string): Promise<Response> {
  const hostname = new URL(webhook.url).hostname;
  if (isPrivateHostname(hostname)) {
    throw new AppError("VALIDATION_ERROR", "Webhook URL targets a private address.");
  }
  return fetch(webhook.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenCan-Signature": signature,
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
}

async function deliver(webhook: WebhookEndpoint, body: string): Promise<void> {
  const signature = sign(webhook.secret, body);
  const urlDomain = new URL(webhook.url).hostname;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await sendRequest(webhook, body, signature);
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
  const webhooks = await getActiveWebhooksForEvent(event);
  if (webhooks.length === 0) return;

  const payload: WebhookPayload = { event, occurredAt: new Date().toISOString(), data };
  const body = JSON.stringify(payload);

  await Promise.allSettled(webhooks.map((wh) => deliver(wh, body)));
}

export async function testWebhookDelivery(
  webhook: WebhookEndpoint,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const payload: WebhookPayload = {
    event: WEBHOOK_EVENTS[0] as WebhookEvent,
    occurredAt: new Date().toISOString(),
    data: { test: true },
  };
  const body = JSON.stringify(payload);
  const signature = sign(webhook.secret, body);
  const urlDomain = new URL(webhook.url).hostname;

  try {
    const res = await sendRequest(webhook, body, signature);
    logger.info({ webhookId: webhook.id, domain: urlDomain, status: res.status }, "webhook test");
    return { ok: res.ok, status: res.status };
  } catch (err) {
    logger.warn({ webhookId: webhook.id, domain: urlDomain, err }, "webhook test failed");
    return { ok: false, error: "Delivery failed" };
  }
}
