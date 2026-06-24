// jscpd:ignore-start
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

import { redis } from "@/lib/redis";
import { prisma } from "@/server/db";
import { ADMIN_ID, makePipelineMock, type RouterRedisMock } from "@/tests/helpers/router-setup";

const redisMock = redis as unknown as RouterRedisMock;
const pipelineMock = makePipelineMock();

vi.mock("@/server/db");
vi.mock("@/lib/redis", () => ({
  redis: {
    mget: vi.fn(),
    exists: vi.fn(),
    set: vi.fn(),
    pipeline: vi.fn(),
  },
}));
vi.mock("@/lib/email", () => ({
  sendChangelogNotification: vi.fn().mockResolvedValue(undefined),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { changelogRouter } = await import("@/server/routers/changelog");
const { createCallerFactory } = await import("@/server/trpc");
const { createTestContext, createAdminContext } = await import("@/tests/context");
const { sendChangelogNotification } = await import("@/lib/email");

const createCaller = createCallerFactory(changelogRouter);
// jscpd:ignore-end

const ENTRY_ID = "centry1234567890";
const POST_ID = "cpost11234567890";
const NOW = new Date("2026-06-23T12:00:00.000Z");

function makeEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    slug: "release-v2",
    title: "Release v2",
    body: "## Changes\n\nSome details.",
    authorId: ADMIN_ID,
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    author: { name: "Admin" },
    _count: { linkedPosts: 0 },
    linkedPosts: [],
    ...overrides,
  };
}

describe("changelogRouter", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
    redisMock.pipeline.mockReturnValue(pipelineMock);
    pipelineMock.exec.mockResolvedValue([[null, 1], [null, 1]]);
  });

  // ---------------------------------------------------------------------------
  // changelog.list
  // ---------------------------------------------------------------------------

  describe("changelog.list", () => {
    it("returns published entries for unauthenticated caller", async () => {
      prismaMock.changelogEntry.findMany.mockResolvedValue([makeEntryRow()] as never);
      const caller = createCaller(createTestContext());
      const result = await caller.list({});
      expect(result.items).toHaveLength(1);
      const [first] = result.items;
      expect(first?.slug).toBe("release-v2");
    });

    it("throws BAD_REQUEST on invalid cursor", async () => {
      prismaMock.changelogEntry.findMany.mockRejectedValue(
        Object.assign(new Error("VALIDATION_ERROR"), { code: "VALIDATION_ERROR" }),
      );
      // Use a real invalid cursor to trigger AppError from decodeCursor
      const caller = createCaller(createTestContext());
      await expect(caller.list({ cursor: "!!not-base64!!" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("throws INTERNAL_SERVER_ERROR on unexpected db error", async () => {
      prismaMock.changelogEntry.findMany.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createTestContext());
      await expect(caller.list({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  // ---------------------------------------------------------------------------
  // changelog.get
  // ---------------------------------------------------------------------------

  describe("changelog.get", () => {
    it("returns entry detail for a published slug", async () => {
      const entryWithPosts = {
        ...makeEntryRow(),
        linkedPosts: [
          {
            post: {
              id: POST_ID,
              postNumber: 7,
              title: "Dark mode",
              status: "SHIPPED",
              board: { slug: "features", name: "Features" },
            },
          },
        ],
      };
      prismaMock.changelogEntry.findUnique.mockResolvedValue(entryWithPosts as never);
      const caller = createCaller(createTestContext());
      const result = await caller.get({ slug: "release-v2" });
      expect(result.title).toBe("Release v2");
      expect(result.linkedPosts).toHaveLength(1);
    });

    it("throws NOT_FOUND when entry does not exist", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      const caller = createCaller(createTestContext());
      await expect(caller.get({ slug: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

  });

  // ---------------------------------------------------------------------------
  // changelog.listAll (admin)
  // ---------------------------------------------------------------------------

  describe("changelog.listAll", () => {
    it("throws UNAUTHORIZED for unauthenticated caller", async () => {
      const caller = createCaller(createTestContext());
      await expect(caller.listAll({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns all entries including drafts for admin", async () => {
      const draft = makeEntryRow({ id: "cdraft1234567890", slug: "draft", publishedAt: null });
      prismaMock.changelogEntry.findMany.mockResolvedValue([makeEntryRow(), draft] as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.listAll({});
      expect(result.items).toHaveLength(2);
    });

    it("throws INTERNAL_SERVER_ERROR on unexpected db error", async () => {
      prismaMock.changelogEntry.findMany.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.listAll({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  // ---------------------------------------------------------------------------
  // changelog.create
  // ---------------------------------------------------------------------------

  describe("changelog.create", () => {
    it("throws UNAUTHORIZED for non-admin", async () => {
      const caller = createCaller(createTestContext());
      await expect(
        caller.create({ slug: "new-entry", title: "Title", body: "Body", linkedPostIds: [] }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("creates a draft entry and returns id + slug", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null); // slug not taken
      prismaMock.changelogEntry.create.mockResolvedValue({
        id: ENTRY_ID,
        slug: "new-entry",
      } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.create({
        slug: "new-entry",
        title: "New Entry",
        body: "# Hello",
        linkedPostIds: [],
      });
      expect(result).toMatchObject({ id: ENTRY_ID, slug: "new-entry" });
    });

    it("throws CONFLICT when slug is already taken", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: "existing" } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.create({ slug: "taken", title: "T", body: "B", linkedPostIds: [] }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects invalid slug format", async () => {
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.create({ slug: "INVALID_SLUG", title: "T", body: "B", linkedPostIds: [] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("throws INTERNAL_SERVER_ERROR on unexpected db error", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      prismaMock.changelogEntry.create.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.create({ slug: "new-entry", title: "T", body: "B", linkedPostIds: [] }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  // ---------------------------------------------------------------------------
  // changelog.update
  // ---------------------------------------------------------------------------

  describe("changelog.update", () => {
    it("throws NOT_FOUND when entry does not exist", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.update({ id: ENTRY_ID, title: "New" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("throws CONFLICT when entry is already published", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID, publishedAt: NOW } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.update({ id: ENTRY_ID, title: "T" })).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("updates and returns id", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID, publishedAt: null } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.changelogEntry.update.mockResolvedValue({ id: ENTRY_ID } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.update({ id: ENTRY_ID, title: "Updated Title" });
      expect(result).toEqual({ id: ENTRY_ID });
    });

    it("throws INTERNAL_SERVER_ERROR on unexpected db error", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID, publishedAt: null } as never);
      prismaMock.$transaction.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.update({ id: ENTRY_ID, title: "T" })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // changelog.publish
  // ---------------------------------------------------------------------------

  describe("changelog.publish", () => {
    it("throws NOT_FOUND when entry does not exist", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.publish({ id: ENTRY_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws CONFLICT when entry is already published", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({
        id: ENTRY_ID,
        publishedAt: NOW,
        linkedPosts: [],
      } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.publish({ id: ENTRY_ID })).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("publishes entry and returns id + publishedAt", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({
        id: ENTRY_ID,
        publishedAt: null,
        linkedPosts: [],
      } as never);
      prismaMock.changelogEntry.update.mockResolvedValue({ id: ENTRY_ID } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.publish({ id: ENTRY_ID });
      expect(result.id).toBe(ENTRY_ID);
      expect(result.publishedAt).toBeInstanceOf(Date);
    });

    it("throws INTERNAL_SERVER_ERROR on unexpected db error", async () => {
      prismaMock.changelogEntry.findUnique.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.publish({ id: ENTRY_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("sends notifications to voters of linked posts", async () => {
      prismaMock.changelogEntry.findUnique
        .mockResolvedValueOnce({
          id: ENTRY_ID,
          publishedAt: null,
          linkedPosts: [{ postId: POST_ID }],
        } as never)
        .mockResolvedValueOnce({
          id: ENTRY_ID,
          slug: "release-v2",
          title: "Release v2",
          body: "# Hello",
          publishedAt: null,
          linkedPosts: [{ postId: POST_ID }],
        } as never);
      prismaMock.changelogEntry.update.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.vote.findMany.mockResolvedValue([
        { user: { email: "voter@example.com" } },
      ] as never);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      await caller.publish({ id: ENTRY_ID });
      await new Promise((r) => setTimeout(r, 0)); // flush microtask queue

      expect(sendChangelogNotification).toHaveBeenCalledWith(
        "voter@example.com",
        "Release v2",
        expect.stringContaining("/changelog/release-v2"),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // changelog.delete
  // ---------------------------------------------------------------------------

  describe("changelog.delete", () => {
    it("throws NOT_FOUND when entry does not exist", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.delete({ id: ENTRY_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("deletes and returns id", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.changelogEntry.delete.mockResolvedValue({ id: ENTRY_ID } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.delete({ id: ENTRY_ID });
      expect(result).toEqual({ id: ENTRY_ID });
    });

    it("throws INTERNAL_SERVER_ERROR on unexpected db error", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.changelogEntry.delete.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.delete({ id: ENTRY_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });
});
