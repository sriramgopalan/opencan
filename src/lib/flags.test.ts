import { afterEach, describe, expect, it } from "vitest";

import { isEnabled } from "@/lib/flags";

describe("isEnabled", () => {
  afterEach(() => {
    delete process.env["FEATURE_ROADMAP_PAGE"];
  });

  it("returns the default value when no env override is set", () => {
    expect(isEnabled("ROADMAP_PAGE")).toBe(true);
  });

  it("returns true when FEATURE_<flag> env is 'true'", () => {
    process.env["FEATURE_ROADMAP_PAGE"] = "true";
    expect(isEnabled("ROADMAP_PAGE")).toBe(true);
  });

  it("returns false when FEATURE_<flag> env is 'false'", () => {
    process.env["FEATURE_ROADMAP_PAGE"] = "false";
    expect(isEnabled("ROADMAP_PAGE")).toBe(false);
  });
});
