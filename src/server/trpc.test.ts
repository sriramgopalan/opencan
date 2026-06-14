import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

const loggerErrorMock = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerErrorMock, info: vi.fn() },
}));

const {
  createCallerFactory,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} = await import("@/server/trpc");

const testRouter = createTRPCRouter({
  throwsAppError: publicProcedure.mutation(() => {
    throw new TRPCError({
      code: "BAD_REQUEST",
      cause: new AppError("VALIDATION_ERROR", "Custom app error"),
    });
  }),
  throwsUnhandled: publicProcedure.mutation(() => {
    // Unhandled Error becomes INTERNAL_SERVER_ERROR
    throw new Error("unexpected crash");
  }),
  throwsGeneric: publicProcedure.mutation(() => {
    throw new TRPCError({ code: "NOT_FOUND" });
  }),
  authedOk: protectedProcedure.query(() => ({ ok: true })),
});

const createCaller = createCallerFactory(testRouter);

type BatchItem = { result?: unknown; error?: { json: { message: string; data: Record<string, unknown> } } };

async function callMutation(procedure: string): Promise<BatchItem> {
  const req = new Request(`http://localhost/trpc/${procedure}?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "0": { json: null } }),
  });
  const res = await fetchRequestHandler({
    endpoint: "/trpc",
    req,
    router: testRouter,
    createContext: async () => ({ session: null, ip: "127.0.0.1" }),
  });
  const [first = {} as BatchItem] = (await res.json()) as [BatchItem];
  return first;
}

describe("trpc errorFormatter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shapes AppError: overrides message and adds appErrorCode", async () => {
    const result = await callMutation("throwsAppError");
    expect(result.error?.json.message).toBe("Custom app error");
    expect(result.error?.json.data["appErrorCode"]).toBe("VALIDATION_ERROR");
  });

  it("sanitises INTERNAL_SERVER_ERROR with generic message and logs", async () => {
    const result = await callMutation("throwsUnhandled");
    expect(result.error?.json.message).toBe("An unexpected error occurred");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      "unhandled tRPC error",
    );
  });

  it("passes through other TRPCErrors without modification", async () => {
    const result = await callMutation("throwsGeneric");
    expect(result.error).toBeDefined();
    expect(result.error?.json.data["code"]).toBe("NOT_FOUND");
  });
});

describe("trpc authMiddleware", () => {
  it("throws UNAUTHORIZED when session is absent", async () => {
    const caller = createCaller({ session: null, ip: "127.0.0.1" });
    await expect(caller.authedOk()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("passes through when session contains a user id", async () => {
    const caller = createCaller({
      session: {
        user: { id: "u-1", email: "test@example.com", name: null, image: null, role: "MEMBER" },
        expires: new Date(Date.now() + 86_400_000).toISOString(),
      },
      ip: "127.0.0.1",
    });
    const result = await caller.authedOk();
    expect(result).toEqual({ ok: true });
  });
});
