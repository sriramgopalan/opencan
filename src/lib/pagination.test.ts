import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { decodeCursor, encodeCursor, sliceAndCursor } from "@/lib/pagination";

const NOW = new Date("2026-06-23T12:00:00.000Z");

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a date and id", () => {
    const cursor = encodeCursor(NOW, "abc123");
    expect(decodeCursor(cursor)).toBe("abc123");
  });

  it("throws VALIDATION_ERROR on invalid base64", () => {
    expect(() => decodeCursor("!!not-base64!!")).toThrow(AppError);
  });

  it("throws VALIDATION_ERROR when decoded string has no id part", () => {
    const bad = Buffer.from("onlydate").toString("base64");
    expect(() => decodeCursor(bad)).toThrow(AppError);
  });
});

describe("sliceAndCursor", () => {
  const makeItems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      createdAt: new Date(NOW.getTime() - i * 1000),
    }));

  it("returns all items when fewer than limit", () => {
    const rows = makeItems(3);
    const { items, nextCursor } = sliceAndCursor(rows, 5, (r) => r.createdAt);
    expect(items).toHaveLength(3);
    expect(nextCursor).toBeNull();
  });

  it("slices to limit and returns cursor when more exist", () => {
    const rows = makeItems(6); // limit 5 → 5 items + 1 extra
    const { items, nextCursor } = sliceAndCursor(rows, 5, (r) => r.createdAt);
    expect(items).toHaveLength(5);
    expect(nextCursor).not.toBeNull();
  });

  it("returns null cursor when rows array is empty", () => {
    const { items, nextCursor } = sliceAndCursor([], 5, (r: { id: string; createdAt: Date }) => r.createdAt);
    expect(items).toHaveLength(0);
    expect(nextCursor).toBeNull();
  });
});
