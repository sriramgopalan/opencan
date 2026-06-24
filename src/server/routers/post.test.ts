// jscpd:ignore-start
import { PostStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";

import { redis } from "@/lib/redis";
import { prisma } from "@/server/db";
import { BASE_POST, BOARD_ID, makeRow, POST_ID, USER_ID } from "@/tests/helpers/post-fixtures";
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
vi.mock("@/lib/email", () => ({
  sendStatusChangeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/webhook", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const { postRouter } = await import("@/server/routers/post");
const { createCallerFactory } = await import("@/server/trpc");
const { createTestContext, createAuthedContext, createAdminContext } = await import(
  "@/tests/context"
);
const { sendStatusChangeEmail } = await import("@/lib/email");
const { dispatchWebhook } = await import("@/lib/webhook");

const createCaller = createCallerFactory(postRouter);
// jscpd:ignore-end

function mockToggleVotePost(settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const publicRow = makeRow({
    authorId: USER_ID,
    author: null,
    pinnedAt: null,
    updatedAt: new Date(),
  });
  prismaMock.post.findUnique.mockResolvedValue(publicRow as never);
  prismaMock.board.findUnique.mockResolvedValue({
    ...BASE_BOARD,
    settingsJson: { ...DEFAULT_SETTINGS, ...settingsOverrides },
  } as never);
}

describe("postRouter", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
    redisMock.mget.mockResolvedValue([]);
    redisMock.exists.mockResolvedValue(0);
    redisMock.pipeline.mockReturnValue(pipelineMock);
    pipelineMock.exec.mockResolvedValue([[null, 1], [null, 1]]);
  });

  // ---------------------------------------------------------------------------
  // posts.create
  // ---------------------------------------------------------------------------

  describe("posts.create", () => {
    function mockCreatePost(settingsOverrides?: Partial<typeof DEFAULT_SETTINGS>) {
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_BOARD,
        settingsJson: { ...DEFAULT_SETTINGS, ...settingsOverrides },
      } as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.post.aggregate.mockResolvedValue({ _max: { postNumber: null } } as never);
      prismaMock.post.create.mockResolvedValue({ id: POST_ID, postNumber: 1 } as never);
    }

    it("creates post for authenticated user on AUTHENTICATED board", async () => {
      mockCreatePost();
      const caller = createCaller(createAuthedContext(USER_ID));
      const result = await caller.create({ boardId: BOARD_ID, title: "Hello world" });
      expect(result.postNumber).toBe(1);
    });

    it("rejects unauthenticated user on AUTHENTICATED board", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      const caller = createCaller(createTestContext());
      await expect(
        caller.create({ boardId: BOARD_ID, title: "Hello world" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects guest on ADMINS_ONLY board", async () => {
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_BOARD,
        settingsJson: { ...DEFAULT_SETTINGS, whoCanPost: "ADMINS_ONLY" },
      } as never);
      const caller = createCaller(createTestContext());
      await expect(
        caller.create({ boardId: BOARD_ID, title: "Hello world", guestName: "Guest" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("requires guestName when caller is unauthenticated and whoCanPost=ANYONE", async () => {
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_BOARD,
        settingsJson: { ...DEFAULT_SETTINGS, whoCanPost: "ANYONE" },
      } as never);
      const caller = createCaller(createTestContext());
      await expect(
        caller.create({ boardId: BOARD_ID, title: "Hello world" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("allows guest on ANYONE board with guestName", async () => {
      mockCreatePost({ whoCanPost: "ANYONE" });
      const caller = createCaller(createTestContext());
      const result = await caller.create({
        boardId: BOARD_ID,
        title: "Guest idea",
        guestName: "Alice Guest",
      });
      expect(result.postNumber).toBe(1);
    });

    it("creates post with PENDING status when postModerationEnabled", async () => {
      mockCreatePost({ postModerationEnabled: true });
      prismaMock.post.create.mockResolvedValue(
        { id: POST_ID, postNumber: 1, status: PostStatus.PENDING } as never,
      );
      const caller = createCaller(createAuthedContext(USER_ID));
      await caller.create({ boardId: BOARD_ID, title: "Moderated post" });
      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PostStatus.PENDING }),
        }),
      );
      expect(dispatchWebhook).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND when board does not exist", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.create({ boardId: BOARD_ID, title: "A valid title" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns NOT_FOUND for private board to non-admin", async () => {
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_BOARD,
        isPublic: false,
      } as never);
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.create({ boardId: BOARD_ID, title: "A valid title" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("creates post with a description", async () => {
      mockCreatePost();
      const caller = createCaller(createAuthedContext(USER_ID));
      await caller.create({ boardId: BOARD_ID, title: "Hello world", description: "Some details" });
      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: "Some details" }) }),
      );
    });

    it("returns CONFLICT when createPost reports a post-number conflict", async () => {
      const { Prisma } = await import("@prisma/client");
      mockCreatePost();
      prismaMock.post.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "5.0.0",
        }),
      );
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.create({ boardId: BOARD_ID, title: "Hello world" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("returns INTERNAL_SERVER_ERROR when createPost fails unexpectedly", async () => {
      mockCreatePost();
      prismaMock.post.create.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.create({ boardId: BOARD_ID, title: "Hello world" }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  // ---------------------------------------------------------------------------
  // posts.getById
  // ---------------------------------------------------------------------------

  describe("posts.getById", () => {
    it("returns public post to unauthenticated caller", async () => {
      prismaMock.post.findUnique.mockResolvedValue(makeRow() as never);
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.vote.findUnique.mockResolvedValue(null);

      const caller = createCaller(createTestContext());
      const result = await caller.getById({ id: POST_ID });
      expect(result.id).toBe(POST_ID);
      expect(result).not.toHaveProperty("author");
    });

    it("throws NOT_FOUND when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);
      const caller = createCaller(createTestContext());
      await expect(caller.getById({ id: "cnotfound0000001" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns INTERNAL_SERVER_ERROR when the repository throws unexpectedly", async () => {
      prismaMock.post.findUnique.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createTestContext());
      await expect(caller.getById({ id: POST_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // posts.update
  // ---------------------------------------------------------------------------

  describe("posts.update", () => {
    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(createTestContext());
      await expect(
        caller.update({ id: POST_ID, title: "New title" }),
      ).rejects.toThrow(TRPCError);
    });

    it("returns NOT_FOUND when post not found", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.update({ id: POST_ID, title: "New title here" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns NOT_FOUND when caller is not author", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        authorId: "someone-else",
        status: PostStatus.OPEN,
        boardId: BOARD_ID,
      } as never);
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.update({ id: POST_ID, title: "New title here" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("rejects author editing SHIPPED post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        authorId: USER_ID,
        status: PostStatus.SHIPPED,
        boardId: BOARD_ID,
      } as never);
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.update({ id: POST_ID, title: "New title here" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("allows admin to update any post in any status", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        authorId: USER_ID,
        status: PostStatus.SHIPPED,
        boardId: BOARD_ID,
      } as never);
      prismaMock.post.update.mockResolvedValue({ ...BASE_POST, title: "Admin fix" } as never);
      prismaMock.vote.findMany.mockResolvedValue([]);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.update({ id: POST_ID, title: "Admin fix" });
      expect(result.title).toBe("Admin fix");
    });

    it("allows author to update their own post and returns a restricted view", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        authorId: USER_ID,
        status: PostStatus.OPEN,
        boardId: BOARD_ID,
      } as never);
      prismaMock.post.update.mockResolvedValue({ ...BASE_POST, title: "My update" } as never);
      prismaMock.vote.findMany.mockResolvedValue([]);
      const caller = createCaller(createAuthedContext(USER_ID));
      const result = await caller.update({ id: POST_ID, title: "My update" });
      expect(result.title).toBe("My update");
      expect(result).not.toHaveProperty("author");
      expect(result).not.toHaveProperty("pinnedAt");
    });

    it("updates only description without changing title", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        authorId: USER_ID,
        status: PostStatus.OPEN,
        boardId: BOARD_ID,
      } as never);
      prismaMock.post.update.mockResolvedValue({ ...BASE_POST, description: "Updated description" } as never);
      prismaMock.vote.findMany.mockResolvedValue([]);
      const caller = createCaller(createAuthedContext(USER_ID));
      const result = await caller.update({ id: POST_ID, description: "Updated description" });
      expect(result.description).toBe("Updated description");
    });

    it("returns INTERNAL_SERVER_ERROR when update fails unexpectedly", async () => {
      prismaMock.post.findUnique.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.update({ id: POST_ID, title: "New title here" }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  // ---------------------------------------------------------------------------
  // posts.delete
  // ---------------------------------------------------------------------------

  describe("posts.delete", () => {
    it("rejects non-admin", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.delete({ id: POST_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("deletes post and returns counts", async () => {
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.vote.deleteMany.mockResolvedValue({ count: 2 } as never);
      prismaMock.post.delete.mockResolvedValue({ id: POST_ID } as never);

      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.delete({ id: POST_ID });
      expect(result.id).toBe(POST_ID);
      expect(result.deletedCounts.votes).toBe(2);
    });

    it("returns NOT_FOUND when delete fails with a P2025 error", async () => {
      prismaMock.$transaction.mockRejectedValue(
        Object.assign(new Error("Record not found"), { code: "P2025" }),
      );
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.delete({ id: POST_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns INTERNAL_SERVER_ERROR when delete fails with a different prisma error code", async () => {
      prismaMock.$transaction.mockRejectedValue(
        Object.assign(new Error("Some other error"), { code: "P9999" }),
      );
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.delete({ id: POST_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("returns INTERNAL_SERVER_ERROR when delete fails with a generic error", async () => {
      prismaMock.$transaction.mockRejectedValue(new Error("boom"));
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.delete({ id: POST_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("returns INTERNAL_SERVER_ERROR when delete fails with a non-error value", async () => {
      prismaMock.$transaction.mockRejectedValue({ code: "P2025" });
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.delete({ id: POST_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // posts.list
  // ---------------------------------------------------------------------------

  describe("posts.list", () => {
    it("returns NOT_FOUND when board does not exist", async () => {
      prismaMock.board.findUnique.mockResolvedValue(null);
      const caller = createCaller(createTestContext());
      await expect(caller.list({ boardId: BOARD_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns NOT_FOUND for private board to non-admin", async () => {
      prismaMock.board.findUnique.mockResolvedValue({
        ...BASE_BOARD,
        isPublic: false,
      } as never);
      const caller = createCaller(createTestContext());
      await expect(caller.list({ boardId: BOARD_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns posts for public board", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.post.findMany.mockResolvedValue([BASE_POST] as never);
      prismaMock.vote.findMany.mockResolvedValue([]);

      const caller = createCaller(createTestContext());
      const result = await caller.list({ boardId: BOARD_ID });
      expect(result.items).toHaveLength(1);
    });

    it("returns BAD_REQUEST when cursor is malformed", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      const cursor = Buffer.from("no-pipe-here").toString("base64");
      const caller = createCaller(createTestContext());
      await expect(caller.list({ boardId: BOARD_ID, cursor })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("returns INTERNAL_SERVER_ERROR when listPosts fails unexpectedly", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.post.findMany.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createTestContext());
      await expect(caller.list({ boardId: BOARD_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // posts.setStatus
  // ---------------------------------------------------------------------------

  describe("posts.setStatus", () => {
    it("rejects non-admin", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(
        caller.setStatus({ id: POST_ID, status: "PLANNED" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects unknown status values via Zod schema", async () => {
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        // @ts-expect-error — testing schema-level rejection of disallowed status
        caller.setStatus({ id: POST_ID, status: "PENDING" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("updates status for admin", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ status: PostStatus.OPEN } as never);
      prismaMock.post.update.mockResolvedValue({
        id: POST_ID,
        status: PostStatus.PLANNED,
        updatedAt: new Date(),
      } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.setStatus({ id: POST_ID, status: "PLANNED" });
      expect(result?.status).toBe(PostStatus.PLANNED);
    });

    it("returns NOT_FOUND when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(
        caller.setStatus({ id: "cnotfound0000001", status: "PLANNED" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    async function triggerStatusChange(notificationRow: Record<string, unknown>) {
      prismaMock.post.findUnique
        .mockResolvedValueOnce({ status: PostStatus.OPEN } as never)
        .mockResolvedValueOnce(notificationRow as never);
      prismaMock.post.update.mockResolvedValue({
        id: POST_ID, status: PostStatus.PLANNED, updatedAt: new Date(),
      } as never);
      await createCaller(createAdminContext(ADMIN_ID)).setStatus({ id: POST_ID, status: "PLANNED" });
      await new Promise(r => setTimeout(r, 0));
    }

    it("skips notification for guest post (no authorEmail)", async () => {
      await triggerStatusChange({
        postNumber: 1, title: "Guest post", board: { slug: "feedback" }, author: null,
      });
      expect(vi.mocked(sendStatusChangeEmail)).not.toHaveBeenCalled();
    });

    it("skips notification when author has opted out", async () => {
      await triggerStatusChange({
        postNumber: 2, title: "My post", board: { slug: "ideas" },
        author: { email: "quiet@example.com", notifyOnStatusChange: false },
      });
      expect(vi.mocked(sendStatusChangeEmail)).not.toHaveBeenCalled();
    });

    it("sends notification when author is opted in", async () => {
      await triggerStatusChange({
        postNumber: 7, title: "Feature request", board: { slug: "features" },
        author: { email: "author@example.com", notifyOnStatusChange: true },
      });
      expect(vi.mocked(sendStatusChangeEmail)).toHaveBeenCalledWith(
        "author@example.com",
        "Feature request",
        PostStatus.OPEN,
        PostStatus.PLANNED,
        expect.stringContaining("/boards/features/posts/7"),
        expect.stringContaining("/settings"),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // posts.setPin
  // ---------------------------------------------------------------------------

  describe("posts.setPin", () => {
    it("rejects non-admin", async () => {
      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.setPin({ id: POST_ID, pinned: true })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("pins a post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ isPinned: false } as never);
      prismaMock.post.update.mockResolvedValue({
        id: POST_ID,
        isPinned: true,
        pinnedAt: new Date(),
      } as never);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      const result = await caller.setPin({ id: POST_ID, pinned: true });
      expect(result?.isPinned).toBe(true);
    });

    it("returns NOT_FOUND when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);
      const caller = createCaller(createAdminContext(ADMIN_ID));
      await expect(caller.setPin({ id: "cnotfound0000001", pinned: true })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // posts.toggleVote
  // ---------------------------------------------------------------------------

  describe("posts.toggleVote", () => {
    it("toggles vote for authenticated user", async () => {
      mockToggleVotePost();
      prismaMock.vote.findMany.mockResolvedValue([]);
      prismaMock.vote.findUnique.mockResolvedValue(null);
      prismaMock.vote.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.post.update.mockResolvedValue({ voteCount: 1 } as never);

      const caller = createCaller(createAuthedContext(USER_ID));
      const result = await caller.toggleVote({ postId: POST_ID });
      expect(result.voteCount).toBe(1);
      expect(result.userHasVoted).toBe(true);
    });

    it("rejects guest vote when guestVotingEnabled=false", async () => {
      mockToggleVotePost();

      const caller = createCaller(createTestContext());
      await expect(caller.toggleVote({ postId: POST_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("throws NOT_FOUND when the post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);
      const caller = createCaller(createTestContext());
      await expect(caller.toggleVote({ postId: POST_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("allows a guest vote when guestVotingEnabled is true", async () => {
      mockToggleVotePost({ guestVotingEnabled: true });
      redisMock.set.mockResolvedValue("OK");
      prismaMock.$transaction.mockImplementation(
        ((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never,
      );
      prismaMock.vote.create.mockResolvedValue({} as never);
      prismaMock.post.update.mockResolvedValue({ voteCount: 1 } as never);

      const caller = createCaller(createTestContext());
      const result = await caller.toggleVote({ postId: POST_ID });
      expect(result.voteCount).toBe(1);
      expect(result.userHasVoted).toBe(false);
    });

    it("returns FORBIDDEN when a guest has already voted", async () => {
      mockToggleVotePost({ guestVotingEnabled: true });
      redisMock.set.mockResolvedValue(null);

      const caller = createCaller(createTestContext());
      await expect(caller.toggleVote({ postId: POST_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("returns INTERNAL_SERVER_ERROR when toggleVote fails unexpectedly", async () => {
      mockToggleVotePost();
      prismaMock.vote.findMany.mockResolvedValue([]);
      prismaMock.$transaction.mockRejectedValue(new Error("db down"));

      const caller = createCaller(createAuthedContext(USER_ID));
      await expect(caller.toggleVote({ postId: POST_ID })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // posts.getSimilar
  // ---------------------------------------------------------------------------

  describe("posts.getSimilar", () => {
    it("is publicly accessible on public boards", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.$queryRaw.mockResolvedValue([]);
      const caller = createCaller(createTestContext());
      const result = await caller.getSimilar({ boardId: BOARD_ID, title: "test" });
      expect(result.items).toHaveLength(0);
    });

    it("returns NOT_FOUND for private board to non-admin", async () => {
      prismaMock.board.findUnique.mockResolvedValue({ ...BASE_BOARD, isPublic: false } as never);
      const caller = createCaller(createTestContext());
      await expect(
        caller.getSimilar({ boardId: BOARD_ID, title: "test" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns similar posts", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.$queryRaw.mockResolvedValue([
        { postNumber: 1, title: "Similar", voteCount: 2, status: "OPEN" },
      ] as never);
      const caller = createCaller(createTestContext());
      const result = await caller.getSimilar({ boardId: BOARD_ID, title: "similar" });
      expect(result.items[0]?.title).toBe("Similar");
    });

    it("returns INTERNAL_SERVER_ERROR when getSimilarPosts fails", async () => {
      prismaMock.board.findUnique.mockResolvedValue(BASE_BOARD as never);
      prismaMock.$queryRaw.mockRejectedValue(new Error("db down"));
      const caller = createCaller(createTestContext());
      await expect(
        caller.getSimilar({ boardId: BOARD_ID, title: "test" }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });
});
