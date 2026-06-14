import { describe, expect, it } from "vitest";

import {
  generateRandomSuffix,
  generateSlugFromName,
  isSlugFormatValid,
  isSlugReserved,
} from "@/lib/slug";

describe("isSlugReserved", () => {
  it("returns true for reserved slugs", () => {
    expect(isSlugReserved("api")).toBe(true);
    expect(isSlugReserved("admin")).toBe(true);
    expect(isSlugReserved("dashboard")).toBe(true);
  });

  it("returns false for non-reserved slugs", () => {
    expect(isSlugReserved("my-board")).toBe(false);
    expect(isSlugReserved("product-requests")).toBe(false);
  });
});

describe("isSlugFormatValid", () => {
  it("returns true for valid slugs", () => {
    expect(isSlugFormatValid("abc")).toBe(true);
    expect(isSlugFormatValid("my-board-123")).toBe(true);
    expect(isSlugFormatValid("a".repeat(50))).toBe(true);
  });

  it("rejects slugs shorter than 3 characters", () => {
    expect(isSlugFormatValid("ab")).toBe(false);
    expect(isSlugFormatValid("a")).toBe(false);
  });

  it("rejects slugs longer than 50 characters", () => {
    expect(isSlugFormatValid("a".repeat(51))).toBe(false);
  });

  it("rejects slugs that end with a hyphen", () => {
    expect(isSlugFormatValid("abc-")).toBe(false);
  });

  it("rejects slugs that contain consecutive hyphens", () => {
    expect(isSlugFormatValid("a--b")).toBe(false);
  });

  it("rejects slugs that do not start with a letter", () => {
    expect(isSlugFormatValid("1abc")).toBe(false);
    expect(isSlugFormatValid("-abc")).toBe(false);
  });

  it("rejects slugs that contain uppercase letters", () => {
    expect(isSlugFormatValid("MyBoard")).toBe(false);
  });

  it("rejects slugs with special characters", () => {
    expect(isSlugFormatValid("my_board")).toBe(false);
    expect(isSlugFormatValid("my board")).toBe(false);
  });
});

describe("generateSlugFromName", () => {
  it("lowercases and hyphenates a name", () => {
    expect(generateSlugFromName("My Board")).toBe("my-board");
  });

  it("removes special characters", () => {
    expect(generateSlugFromName("Hello! World?")).toBe("hello-world");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(generateSlugFromName("a  b")).toBe("a-b");
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlugFromName("a - b")).toBe("a-b");
  });

  it("returns 'board' when the name produces an empty slug", () => {
    expect(generateSlugFromName("!!!")).toBe("board");
    expect(generateSlugFromName("  ")).toBe("board");
  });

  it("truncates to 50 characters", () => {
    const result = generateSlugFromName("a".repeat(60));
    expect(result.length).toBeLessThanOrEqual(50);
  });
});

describe("generateRandomSuffix", () => {
  it("returns a string of the default length (4)", () => {
    expect(generateRandomSuffix()).toHaveLength(4);
  });

  it("returns a string of the specified length", () => {
    expect(generateRandomSuffix(6)).toHaveLength(6);
    expect(generateRandomSuffix(1)).toHaveLength(1);
  });

  it("returns only lowercase letters and digits", () => {
    const suffix = generateRandomSuffix(100);
    expect(suffix).toMatch(/^[a-z0-9]+$/);
  });
});
