// jscpd:ignore-start
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

import { prisma } from "@/server/db";
import { ADMIN_ID } from "@/tests/helpers/router-setup";

vi.mock("@/server/db");
vi.mock("@/lib/webhook", () => ({
  testWebhookDelivery: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { webhookRouter } = await import("@/server/routers/webhook");
const { createCallerFactory } = await import("@/server/trpc");
const { createTestContext, createAdminContext } = await import("@/tests/context");
const { testWebhookDelivery } = await import("@/lib/webhook");

const createCaller = createCallerFactory(webhookRouter);

const WEBHOOK_ID = "cwh1234567890000";
const NOW = new Date("2026-06-23T12:00:00.000Z");
// jscpd:ignore-end

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WEBHOOK_ID,
    url: "https://example.com/hook",
    secret: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // gitleaks:allow
    events: ["post.created"],
    isActive: true,
    createdAt: NOW,
    ...overrides,
  };
}

describe("webhookRouter", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // webhooks.list
  // ---------------------------------------------------------------------------

  describe("webhooks.list", () => {
    it("throws UNAUTHORIZED for non-admin", async () => {
      const caller = createCaller(createTestContext());
      await expect(caller.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns list with secretPreview for admin", async () => {
      prismaMock.webhook.findMany.mockResolvedValue([makeRow()] as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.list();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("secretPreview");
      expect(result[0]).not.toHaveProperty("secret");
    });
  });

  // ---------------------------------------------------------------------------
  // webhooks.create
  // ---------------------------------------------------------------------------

  describe("webhooks.create", () => {
    it("throws UNAUTHORIZED for non-admin", async () => {
      const caller = createCaller(createTestContext());
      await expect(
        caller.create({ url: "https://example.com/hook", events: ["post.created"] }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("creates webhook and returns full secret", async () => {
      prismaMock.webhook.count.mockResolvedValue(0);
      prismaMock.webhook.create.mockImplementation(
        ((({ data }: { data: { secret: string } }) => Promise.resolve(makeRow({ secret: data.secret }))) as never),
      );
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.create({
        url: "https://example.com/hook",
        events: ["post.created"],
      });
      expect(result).toHaveProperty("secret");
      expect(result.secret).toHaveLength(64);
    });

    it("throws CONFLICT when at webhook limit", async () => {
      prismaMock.webhook.count.mockResolvedValue(10);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.create({ url: "https://example.com/hook", events: ["post.created"] }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects invalid URL", async () => {
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.create({ url: "not-a-url", events: ["post.created"] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects empty events array", async () => {
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.create({ url: "https://example.com/hook", events: [] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  // ---------------------------------------------------------------------------
  // webhooks.delete
  // ---------------------------------------------------------------------------

  describe("webhooks.delete", () => {
    it("throws UNAUTHORIZED for non-admin", async () => {
      const caller = createCaller(createTestContext());
      await expect(caller.delete({ id: WEBHOOK_ID })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("deletes and returns id", async () => {
      prismaMock.webhook.findUnique.mockResolvedValue({ id: WEBHOOK_ID } as never);
      prismaMock.webhook.delete.mockResolvedValue({ id: WEBHOOK_ID } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.delete({ id: WEBHOOK_ID });
      expect(result).toEqual({ id: WEBHOOK_ID });
    });

    it("throws NOT_FOUND when webhook does not exist", async () => {
      prismaMock.webhook.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.delete({ id: WEBHOOK_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // webhooks.test
  // ---------------------------------------------------------------------------

  describe("webhooks.test", () => {
    it("throws UNAUTHORIZED for non-admin", async () => {
      const caller = createCaller(createTestContext());
      await expect(caller.test({ id: WEBHOOK_ID })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("throws NOT_FOUND when webhook does not exist", async () => {
      prismaMock.webhook.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.test({ id: WEBHOOK_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns delivery result from testWebhookDelivery", async () => {
      prismaMock.webhook.findUnique.mockResolvedValue(makeRow() as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.test({ id: WEBHOOK_ID });
      expect(testWebhookDelivery).toHaveBeenCalledOnce();
      expect(result).toEqual({ ok: true, status: 200 });
    });
  });
});
