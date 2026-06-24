import { afterEach, describe, expect, it } from "vitest";

import { isEnabled } from "@/lib/flags";

describe("isEnabled", () => {
  afterEach(() => {
    delete process.env["FEATURE_WIDGET"];
  });

  it("returns the default value when no env override is set", () => {
    expect(isEnabled("WIDGET")).toBe(false);
  });

  it("returns true when FEATURE_<flag> env is 'true'", () => {
    process.env["FEATURE_WIDGET"] = "true";
    expect(isEnabled("WIDGET")).toBe(true);
  });

  it("returns false when FEATURE_<flag> env is 'false'", () => {
    process.env["FEATURE_WIDGET"] = "false";
    expect(isEnabled("WIDGET")).toBe(false);
  });
});
