import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { redis } from "@/lib/redis";

vi.mock("@/lib/redis");

const redisMock = redis as unknown as {
  set: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

const { addToBlocklist, isBlocklisted, removeFromBlocklist } = await import("./session-blocklist");

describe("session-blocklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addToBlocklist", () => {
    it("sets a Redis key with the correct prefix and default TTL", async () => {
      redisMock.set.mockResolvedValue("OK");

      await addToBlocklist("user-1");

      expect(redisMock.set).toHaveBeenCalledWith(
        "session:blocklist:user:user-1",
        "1",
        "EX",
        SESSION_MAX_AGE_SECONDS,
      );
    });

    it("accepts a custom TTL", async () => {
      redisMock.set.mockResolvedValue("OK");

      await addToBlocklist("user-2", 3600);

      expect(redisMock.set).toHaveBeenCalledWith(
        "session:blocklist:user:user-2",
        "1",
        "EX",
        3600,
      );
    });
  });

  describe("isBlocklisted", () => {
    it("returns true when the key exists in Redis", async () => {
      redisMock.exists.mockResolvedValue(1);

      const result = await isBlocklisted("user-1");

      expect(result).toBe(true);
      expect(redisMock.exists).toHaveBeenCalledWith("session:blocklist:user:user-1");
    });

    it("returns false when the key does not exist", async () => {
      redisMock.exists.mockResolvedValue(0);

      const result = await isBlocklisted("user-99");

      expect(result).toBe(false);
    });
  });

  describe("removeFromBlocklist", () => {
    it("deletes the Redis key for the given userId", async () => {
      redisMock.del.mockResolvedValue(1);

      await removeFromBlocklist("user-1");

      expect(redisMock.del).toHaveBeenCalledWith("session:blocklist:user:user-1");
    });
  });
});
