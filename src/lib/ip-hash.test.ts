import { describe, expect, it } from "vitest";

import { hashIp } from "@/lib/ip-hash";

describe("hashIp", () => {
  it("returns a 64-char hex string", () => {
    const h = hashIp("1.2.3.4");

    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("produces same hash for same input", () => {
    expect(hashIp("10.0.0.1")).toBe(hashIp("10.0.0.1"));
  });

  it("produces different hashes for different IPs", () => {
    expect(hashIp("1.1.1.1")).not.toBe(hashIp("2.2.2.2"));
  });

  it("never contains the raw IP", () => {
    expect(hashIp("203.0.113.7")).not.toContain("203.0.113.7");
  });
});
