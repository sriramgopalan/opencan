import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db";
import { mockReset, type DeepMockProxy, type PrismaClient } from "@/tests/helpers/repository-setup";

vi.mock("@/server/db");

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { createWebhook, deleteWebhook, getActiveWebhooksForEvent, listWebhooks } =
  await import("@/server/repositories/webhook");

const WEBHOOK_ID = "cwh1234567890000";
const NOW = new Date("2026-06-23T12:00:00.000Z");

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WEBHOOK_ID,
    url: "https://example.com/hook",
    secret: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // gitleaks:allow
    events: ["post.created", "post.status_changed"],
    isActive: true,
    createdAt: NOW,
    ...overrides,
  };
}

describe("webhook repository", () => {
  afterEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // listWebhooks
  // ---------------------------------------------------------------------------

  describe("listWebhooks", () => {
    it("returns list items with secretPreview (last 4 chars)", async () => {
      prismaMock.webhook.findMany.mockResolvedValue([makeRow()] as never);
      const result = await listWebhooks();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: WEBHOOK_ID,
        url: "https://example.com/hook",
        secretPreview: "7890",
        events: ["post.created", "post.status_changed"],
        isActive: true,
      });
      expect(result[0]).not.toHaveProperty("secret");
    });

    it("returns empty array when no webhooks registered", async () => {
      prismaMock.webhook.findMany.mockResolvedValue([]);
      const result = await listWebhooks();
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getActiveWebhooksForEvent
  // ---------------------------------------------------------------------------

  describe("getActiveWebhooksForEvent", () => {
    it("returns only webhooks subscribed to the given event", async () => {
      prismaMock.webhook.findMany.mockResolvedValue([
        makeRow({ events: ["post.created"] }),
        makeRow({ id: "cwh2345678900000", events: ["comment.created"] }),
      ] as never);
      const result = await getActiveWebhooksForEvent("post.created");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(WEBHOOK_ID);
    });

    it("returns empty array when no webhook matches the event", async () => {
      prismaMock.webhook.findMany.mockResolvedValue([
        makeRow({ events: ["comment.created"] }),
      ] as never);
      const result = await getActiveWebhooksForEvent("post.created");
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // createWebhook
  // ---------------------------------------------------------------------------

  describe("createWebhook", () => {
    it("returns the created webhook including the full secret", async () => {
      prismaMock.webhook.count.mockResolvedValue(0);
      prismaMock.webhook.create.mockImplementation(
        ((({ data }: { data: { secret: string } }) => Promise.resolve(makeRow({ secret: data.secret }))) as never),
      );
      const result = await createWebhook({ url: "https://example.com/hook", events: ["post.created"] });
      expect(result.secret).toHaveLength(64); // 32 random bytes as hex
      expect(result.secretPreview).toBe(result.secret.slice(-4));
    });

    it("throws CONFLICT when webhook count is at WEBHOOK_MAX", async () => {
      prismaMock.webhook.count.mockResolvedValue(10);
      await expect(
        createWebhook({ url: "https://example.com/hook", events: ["post.created"] }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  // ---------------------------------------------------------------------------
  // deleteWebhook
  // ---------------------------------------------------------------------------

  describe("deleteWebhook", () => {
    it("deletes and returns the id", async () => {
      prismaMock.webhook.findUnique.mockResolvedValue({ id: WEBHOOK_ID } as never);
      prismaMock.webhook.delete.mockResolvedValue({ id: WEBHOOK_ID } as never);
      const result = await deleteWebhook(WEBHOOK_ID);
      expect(result).toEqual({ id: WEBHOOK_ID });
    });

    it("throws NOT_FOUND when webhook does not exist", async () => {
      prismaMock.webhook.findUnique.mockResolvedValue(null);
      await expect(deleteWebhook("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
