import { afterEach, describe, expect, it } from "vitest";

import { evaluateFlag } from "@/lib/flags";

describe("evaluateFlag", () => {
  afterEach(() => {
    delete process.env["FEATURE_TEST_FLAG"];
  });

  it("returns the default value when no env override is set", () => {
    expect(evaluateFlag("TEST_FLAG", false)).toBe(false);
    expect(evaluateFlag("TEST_FLAG", true)).toBe(true);
  });

  it("returns true when FEATURE_<flag> env is 'true'", () => {
    process.env["FEATURE_TEST_FLAG"] = "true";

    expect(evaluateFlag("TEST_FLAG", false)).toBe(true);
  });

  it("returns false when FEATURE_<flag> env is 'false'", () => {
    process.env["FEATURE_TEST_FLAG"] = "false";

    expect(evaluateFlag("TEST_FLAG", true)).toBe(false);
  });

  it("ignores override values other than 'true' and 'false'", () => {
    process.env["FEATURE_TEST_FLAG"] = "yes";

    expect(evaluateFlag("TEST_FLAG", false)).toBe(false);
  });
});
