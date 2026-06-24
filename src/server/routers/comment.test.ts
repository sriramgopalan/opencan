// jscpd:ignore-start
import { PostStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

import { redis } from "@/lib/redis";
import { prisma } from "@/server/db";
import {
  BASE_COMMENT,
  BOARD_ID,
  COMMENT_ID,
  POST_ID,
  USER_ID,
  makeCommentRow,
} from "@/tests/helpers/comment-fixtures";
import { makeRow } from "@/tests/helpers/post-fixtures";
import { ADMIN_ID, BASE_BOARD, DEFAULT_SETTINGS, makePipelineMock, type RouterRedisMock } from "@/tests/helpers/router-setup";

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
vi.mock("@/lib/webhook", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { commentRouter } = await import("@/server/routers/comment");
const { dispatchWebhook } = await import("@/lib/webhook");
const { createCallerFactory } = await import("@/server/trpc");
const { createTestContext, createAuthedContext, createAdminContext } = await import(
  "@/tests/context"
);

const createCaller = createCallerFactory(commentRouter);
// jscpd:ignore-end

const PUBLIC_POST = makeRow({ boardId: BOARD_ID });
const ADMIN_POST = makeRow({
  boardId: BOARD_ID,
  authorId: USER_ID,
  author: { id: USER_ID, name: "Alice", email: "alice@example.com" },
  pinnedAt: null,
  updatedAt: new Date(),
});

const PUBLIC_COMMENT = makeCommentRow();
const ADMIN_COMMENT = {
  ...makeCommentRow(),
  authorId: USER_ID,
  author: { id: USER_ID, name: "Alice", email: "alice@example.com" },
};

describe("commentRouter", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
    redisMock.mget.mockResolvedValue([]);
    redisMock.pipeline.mockReturnValue(pipelineMock);
    pipelineMock.exec.mockResolvedValue([[null, 1], [null, 1]]);
    prismaMock.vote.findMany.mockResolvedValue([] as never);
  });

  // ---------------------------------------------------------------------------
  // comments.list
  // ---------------------------------------------------------------------------

  describe("comments.list", () => {
    it("returns paginated items for a public post (unauthenticated)", async () => {
      prismaMock.post.findUnique.mockResolvedValue(PUBLIC_POST as never);
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.comment.findMany.mockResolvedValue([PUBLIC_COMMENT] as never);

      const caller = createCaller(createTestContext());
      const result = await caller.list({ postId: POST_ID });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).not.toHaveProperty("authorId");
    });

    it("returns NOT_FOUND when postId does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      const caller = createCaller(createTestContext());
      await expect(caller.list({ postId: POST_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns NOT_FOUND when post is on a private board", async () => {
      prismaMock.post.findUnique.mockResolvedValue(PUBLIC_POST as never);
      prismaMock.board.findUnique.mockResolvedValue({ ...BASE_BOARD, isPublic: false } as never);

      const caller = createCaller(createTestContext());
      await expect(caller.list({ postId: POST_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("admin receives items with authorId and author.email", async () => {
      prismaMock.post.findUnique.mockResolvedValue(ADMIN_POST as never);
      prismaMock.comment.findMany.mockResolvedValue([ADMIN_COMMENT] as never);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.list({ postId: POST_ID });
      expect(result.items[0]).toHaveProperty("authorId");
      expect((result.items[0] as typeof ADMIN_COMMENT).author?.email).toBe("alice@example.com");
    });

    it("returns BAD_REQUEST on malformed cursor", async () => {
      prismaMock.post.findUnique.mockResolvedValue(PUBLIC_POST as never);
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      const badCursor = Buffer.from("no-pipe-here").toString("base64");

      const caller = createCaller(createTestContext());
      await expect(caller.list({ postId: POST_ID, cursor: badCursor })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("returns empty list when post has no comments", async () => {
      prismaMock.post.findUnique.mockResolvedValue(PUBLIC_POST as never);
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.comment.findMany.mockResolvedValue([] as never);

      const caller = createCaller(createTestContext());
      const result = await caller.list({ postId: POST_ID });
      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // comments.create
  // ---------------------------------------------------------------------------

  describe("comments.create", () => {
    function mockCreate(
      settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {},
      postRow = PUBLIC_POST,
    ) {
      prismaMock.post.findUnique.mockResolvedValue(postRow as never);
      // jscpd:ignore-start
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_BOARD,
        settingsJson: { ...DEFAULT_SETTINGS, ...settingsOverrides },
      } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      // jscpd:ignore-end
      prismaMock.comment.create.mockResolvedValue(BASE_COMMENT as never);
      prismaMock.post.update.mockResolvedValue({} as never);
    }

    it("persists guest comment on ANYONE board", async () => {
      mockCreate({ whoCanPost: "ANYONE" });
      const caller = createCaller(createTestContext());
      const result = await caller.create({ postId: POST_ID, body: "hi", guestName: "Alice" });
      expect(result.id).toBe(COMMENT_ID);
    });

    it("strips HTML from body before storing", async () => {
      mockCreate({ whoCanPost: "ANYONE" });
      const caller = createCaller(createTestContext());
      await caller.create({ postId: POST_ID, body: "<b>hi</b>", guestName: "Alice" });
      expect(prismaMock.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: "hi" }) }),
      );
    });

    it("returns BAD_REQUEST when guestName absent on ANYONE board (unauthenticated)", async () => {
      mockCreate({ whoCanPost: "ANYONE" });
      const caller = createCaller(createTestContext());
      await expect(caller.create({ postId: POST_ID, body: "hi" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("persists comment with authorId for authenticated user", async () => {
      mockCreate({ whoCanPost: "ANYONE" });
      const caller = createCaller(createAuthedContext(USER_ID));
      await caller.create({ postId: POST_ID, body: "hello" });
      expect(prismaMock.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ authorId: USER_ID }) }),
      );
    });

    it("returns UNAUTHORIZED for unauthenticated user on AUTHENTICATED board", async () => {
      mockCreate({ whoCanPost: "AUTHENTICATED" });
      const caller = createCaller(createTestContext());
      await expect(caller.create({ postId: POST_ID, body: "hi" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("returns NOT_FOUND for non-admin on ADMINS_ONLY board", async () => {
      mockCreate({ whoCanPost: "ADMINS_ONLY" });
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.create({ postId: POST_ID, body: "hi" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("admin can comment on ADMINS_ONLY board", async () => {
      mockCreate({ whoCanPost: "ADMINS_ONLY" }, ADMIN_POST);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.create({ postId: POST_ID, body: "admin comment" });
      expect(result.id).toBe(COMMENT_ID);
    });

    it("does not dispatch webhook when post is PENDING", async () => {
      const pendingPost = makeRow({ boardId: BOARD_ID, status: PostStatus.PENDING });
      mockCreate({ whoCanPost: "ADMINS_ONLY" }, pendingPost);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await caller.create({ postId: POST_ID, body: "admin comment on pending" });
      expect(dispatchWebhook).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND when postId does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.create({ postId: POST_ID, body: "hi" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns NOT_FOUND when post is on private board and caller is not admin", async () => {
      prismaMock.post.findUnique.mockResolvedValue(PUBLIC_POST as never);
      prismaMock.board.findUnique.mockResolvedValue({ ...BASE_BOARD, isPublic: false } as never);
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.create({ postId: POST_ID, body: "hi" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns BAD_REQUEST when body is empty string", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.create({ postId: POST_ID, body: "" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("returns BAD_REQUEST when body exceeds 2000 chars", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.create({ postId: POST_ID, body: "x".repeat(2001) }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("returns TOO_MANY_REQUESTS when rate limit exceeded", async () => {
      pipelineMock.exec.mockResolvedValue([[null, 21], [null, 1]]); // > limit of 20
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.create({ postId: POST_ID, body: "hi" })).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // comments.update
  // ---------------------------------------------------------------------------

  describe("comments.update", () => {
    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(createTestContext());
      await expect(caller.update({ id: COMMENT_ID, body: "hi" })).rejects.toThrow(TRPCError);
    });

    it("updates body for authenticated author; response excludes author.email", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ authorId: USER_ID } as never);
      prismaMock.comment.update.mockResolvedValue({
        ...ADMIN_COMMENT,
        body: "updated",
      } as never);

      const caller = createCaller(createAuthedContext(USER_ID));
      const result = await caller.update({ id: COMMENT_ID, body: "updated" });
      expect(result.body).toBe("updated");
      expect(result).not.toHaveProperty("authorId");
      expect((result as { author?: { email?: string } })?.author).not.toHaveProperty("email");
    });

    it("returns NOT_FOUND for non-author (existence masked)", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ authorId: "csomeone0000001" } as never);

      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.update({ id: COMMENT_ID, body: "hi" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("admin non-author can update; response includes author.email", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ authorId: USER_ID } as never);
      prismaMock.comment.update.mockResolvedValue({
        ...ADMIN_COMMENT,
        body: "admin edit",
      } as never);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.update({ id: COMMENT_ID, body: "admin edit" });
      expect((result as typeof ADMIN_COMMENT).author?.email).toBe("alice@example.com");
    });

    it("returns BAD_REQUEST when body is empty", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.update({ id: COMMENT_ID, body: "" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("returns NOT_FOUND when id absent", async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.update({ id: COMMENT_ID, body: "hi" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // comments.delete
  // ---------------------------------------------------------------------------

  describe("comments.delete", () => {
    function mockDeletableComment() {
      prismaMock.comment.findUnique.mockResolvedValue({
        authorId: USER_ID,
        postId: POST_ID,
      } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.comment.delete.mockResolvedValue({} as never);
    }

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(createTestContext());
      await expect(caller.delete({ id: COMMENT_ID })).rejects.toThrow(TRPCError);
    });

    it("author can delete own comment; Post.commentCount is decremented via floor-0 GREATEST", async () => {
      mockDeletableComment();
      const caller = createCaller(createAuthedContext(USER_ID));
      const result = await caller.delete({ id: COMMENT_ID });
      expect(result.id).toBe(COMMENT_ID);
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it("returns NOT_FOUND for non-author", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        authorId: "csomeone0000001",
        postId: POST_ID,
      } as never);

      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.delete({ id: COMMENT_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("admin non-author can delete", async () => {
      mockDeletableComment();
      prismaMock.post.update.mockResolvedValue({} as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.delete({ id: COMMENT_ID });
      expect(result.id).toBe(COMMENT_ID);
    });

    it("returns NOT_FOUND when id absent", async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.delete({ id: COMMENT_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
