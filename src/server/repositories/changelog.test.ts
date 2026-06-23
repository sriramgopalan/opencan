import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db";
import { mockReset, type DeepMockProxy, type PrismaClient } from "@/tests/helpers/repository-setup";

vi.mock("@/server/db");

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const {
  createChangelogEntry,
  deleteChangelogEntry,
  getChangelogEntryById,
  getChangelogEntryBySlug,
  getVoterEmailsForPosts,
  listAllChangelogEntries,
  listChangelogEntries,
  publishChangelogEntry,
  updateChangelogEntry,
} = await import("@/server/repositories/changelog");

const ENTRY_ID = "centry1234567890";
const AUTHOR_ID = "cauthor234567890";
const POST_ID_1 = "cpost11234567890";
const POST_ID_2 = "cpost21234567890";
const NOW = new Date("2026-06-23T12:00:00.000Z");

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    slug: "new-feature-v2",
    title: "New Feature v2",
    body: "## Whats new\n\nSome details.",
    authorId: AUTHOR_ID,
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    author: { name: "Admin" },
    _count: { linkedPosts: 0 },
    linkedPosts: [],
    ...overrides,
  };
}

describe("changelog repository", () => {
  afterEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // listChangelogEntries
  // ---------------------------------------------------------------------------

  describe("listChangelogEntries", () => {
    it("returns published entries with mapped fields", async () => {
      prismaMock.changelogEntry.findMany.mockResolvedValue([makeEntry()] as never);
      const result = await listChangelogEntries({});
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: ENTRY_ID,
        slug: "new-feature-v2",
        title: "New Feature v2",
        publishedAt: NOW,
        authorName: "Admin",
        linkedPostCount: 0,
      });
      expect(result.nextCursor).toBeNull();
    });

    it("returns nextCursor when more items exist", async () => {
      const entries = Array.from({ length: 11 }, (_, i) =>
        makeEntry({ id: `centry${i}`, slug: `entry-${i}`, publishedAt: NOW }),
      );
      prismaMock.changelogEntry.findMany.mockResolvedValue(entries as never);
      const result = await listChangelogEntries({ limit: 10 });
      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).not.toBeNull();
    });

    it("accepts cursor parameter and passes skip to Prisma", async () => {
      const cursor = Buffer.from(`${NOW.toISOString()}|${ENTRY_ID}`).toString("base64");
      prismaMock.changelogEntry.findMany.mockResolvedValue([makeEntry()] as never);
      await listChangelogEntries({ cursor });
      const call = prismaMock.changelogEntry.findMany.mock.calls[0]?.[0];
      expect(call).toMatchObject({ cursor: { id: ENTRY_ID }, skip: 1 });
    });
  });

  it("maps authorName to null when author.name is null", async () => {
    prismaMock.changelogEntry.findMany.mockResolvedValue([
      makeEntry({ author: { name: null } }),
    ] as never);
    const result = await listChangelogEntries({});
    const [first] = result.items;
    expect(first?.authorName).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // getChangelogEntryBySlug
  // ---------------------------------------------------------------------------

  describe("getChangelogEntryBySlug", () => {
    it("returns null when not found", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      const result = await getChangelogEntryBySlug("missing");
      expect(result).toBeNull();
    });

    it("returns mapped detail including linked posts", async () => {
      const entryWithPosts = {
        ...makeEntry(),
        linkedPosts: [
          {
            post: {
              id: POST_ID_1,
              postNumber: 42,
              title: "Dark mode",
              status: "SHIPPED",
              board: { slug: "features", name: "Features" },
            },
          },
        ],
      };
      prismaMock.changelogEntry.findUnique.mockResolvedValue(entryWithPosts as never);
      const result = await getChangelogEntryBySlug("new-feature-v2");
      expect(result).not.toBeNull();
      expect(result?.linkedPosts).toHaveLength(1);
      expect(result?.linkedPosts[0]).toMatchObject({
        id: POST_ID_1,
        postNumber: 42,
        title: "Dark mode",
        status: "SHIPPED",
        boardSlug: "features",
        boardName: "Features",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listAllChangelogEntries (admin)
  // ---------------------------------------------------------------------------

  describe("listAllChangelogEntries", () => {
    it("returns both draft and published entries", async () => {
      const draft = makeEntry({ id: "cdraft1234567890", slug: "draft-entry", publishedAt: null });
      const published = makeEntry();
      prismaMock.changelogEntry.findMany.mockResolvedValue([published, draft] as never);
      const result = await listAllChangelogEntries({});
      expect(result.items).toHaveLength(2);
      const [first, second] = result.items;
      expect(first?.publishedAt).not.toBeNull();
      expect(second?.publishedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getChangelogEntryById
  // ---------------------------------------------------------------------------

  describe("getChangelogEntryById", () => {
    it("returns null when not found", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      const result = await getChangelogEntryById("nope");
      expect(result).toBeNull();
    });

    it("returns entry with linkedPostIds array", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({
        id: ENTRY_ID,
        slug: "new-feature-v2",
        title: "New Feature v2",
        body: "# Hello",
        publishedAt: NOW,
        linkedPosts: [{ postId: POST_ID_1 }, { postId: POST_ID_2 }],
      } as never);
      const result = await getChangelogEntryById(ENTRY_ID);
      expect(result?.linkedPostIds).toEqual([POST_ID_1, POST_ID_2]);
    });
  });

  // ---------------------------------------------------------------------------
  // createChangelogEntry
  // ---------------------------------------------------------------------------

  describe("createChangelogEntry", () => {
    it("throws CONFLICT when slug already exists", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: "existing" } as never);
      await expect(
        createChangelogEntry({ slug: "taken", title: "T", body: "B", authorId: AUTHOR_ID }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("creates entry and returns id + slug", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      prismaMock.changelogEntry.create.mockResolvedValue({
        id: ENTRY_ID,
        slug: "new-feature-v2",
      } as never);
      const result = await createChangelogEntry({
        slug: "new-feature-v2",
        title: "New Feature v2",
        body: "# Hello",
        authorId: AUTHOR_ID,
        linkedPostIds: [POST_ID_1],
      });
      expect(result).toEqual({ id: ENTRY_ID, slug: "new-feature-v2" });
    });
  });

  // ---------------------------------------------------------------------------
  // updateChangelogEntry
  // ---------------------------------------------------------------------------

  describe("updateChangelogEntry", () => {
    it("throws NOT_FOUND when entry does not exist", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      await expect(updateChangelogEntry("missing", { title: "New" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("updates title and replaces linked posts in a transaction", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.changelogEntry.update.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.changelogEntryPost.deleteMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.changelogEntryPost.createMany.mockResolvedValue({ count: 1 } as never);

      const result = await updateChangelogEntry(ENTRY_ID, {
        title: "Updated",
        linkedPostIds: [POST_ID_2],
      });
      expect(result).toEqual({ id: ENTRY_ID });
      expect(prismaMock.changelogEntryPost.deleteMany).toHaveBeenCalledWith({
        where: { entryId: ENTRY_ID },
      });
    });

    it("skips text update when neither title nor body is provided", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.changelogEntryPost.deleteMany.mockResolvedValue({ count: 0 } as never);

      await updateChangelogEntry(ENTRY_ID, { linkedPostIds: [] });
      expect(prismaMock.changelogEntry.update).not.toHaveBeenCalled();
    });

    it("clears all linked posts when linkedPostIds is empty array", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.changelogEntryPost.deleteMany.mockResolvedValue({ count: 2 } as never);

      await updateChangelogEntry(ENTRY_ID, { linkedPostIds: [] });
      expect(prismaMock.changelogEntryPost.deleteMany).toHaveBeenCalledWith({
        where: { entryId: ENTRY_ID },
      });
      expect(prismaMock.changelogEntryPost.createMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // publishChangelogEntry
  // ---------------------------------------------------------------------------

  describe("publishChangelogEntry", () => {
    it("throws NOT_FOUND when entry does not exist", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      await expect(publishChangelogEntry("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws CONFLICT when already published", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({
        id: ENTRY_ID,
        publishedAt: NOW,
        linkedPosts: [],
      } as never);
      await expect(publishChangelogEntry(ENTRY_ID)).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("sets publishedAt and returns linked post ids", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({
        id: ENTRY_ID,
        publishedAt: null,
        linkedPosts: [{ postId: POST_ID_1 }],
      } as never);
      prismaMock.changelogEntry.update.mockResolvedValue({ id: ENTRY_ID } as never);
      const result = await publishChangelogEntry(ENTRY_ID);
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(result.linkedPostIds).toEqual([POST_ID_1]);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteChangelogEntry
  // ---------------------------------------------------------------------------

  describe("deleteChangelogEntry", () => {
    it("throws NOT_FOUND when entry does not exist", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue(null);
      await expect(deleteChangelogEntry("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("deletes and returns id", async () => {
      prismaMock.changelogEntry.findUnique.mockResolvedValue({ id: ENTRY_ID } as never);
      prismaMock.changelogEntry.delete.mockResolvedValue({ id: ENTRY_ID } as never);
      const result = await deleteChangelogEntry(ENTRY_ID);
      expect(result).toEqual({ id: ENTRY_ID });
    });
  });

  // ---------------------------------------------------------------------------
  // getVoterEmailsForPosts
  // ---------------------------------------------------------------------------

  describe("getVoterEmailsForPosts", () => {
    it("returns empty array when postIds is empty", async () => {
      const emails = await getVoterEmailsForPosts([]);
      expect(emails).toEqual([]);
      expect(prismaMock.vote.findMany).not.toHaveBeenCalled();
    });

    it("returns deduplicated emails for voters with notifyOnStatusChange=true", async () => {
      prismaMock.vote.findMany.mockResolvedValue([
        { user: { email: "alice@example.com" } },
        { user: { email: "bob@example.com" } },
        { user: { email: "alice@example.com" } }, // duplicate
      ] as never);
      const emails = await getVoterEmailsForPosts([POST_ID_1, POST_ID_2]);
      expect(emails).toHaveLength(2);
      expect(emails).toContain("alice@example.com");
      expect(emails).toContain("bob@example.com");
    });

    it("skips votes with null user email", async () => {
      prismaMock.vote.findMany.mockResolvedValue([
        { user: null },
        { user: { email: "valid@example.com" } },
      ] as never);
      const emails = await getVoterEmailsForPosts([POST_ID_1]);
      expect(emails).toEqual(["valid@example.com"]);
    });
  });
});
