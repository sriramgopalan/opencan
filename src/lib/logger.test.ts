import { Writable } from "stream";

import { pino } from "pino";
import { describe, expect, it } from "vitest";

import { LOG_REDACT_PATHS } from "@/lib/logger";

function logOnce(obj: Record<string, unknown>): Record<string, unknown> {
  let line = "";
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      line += chunk.toString();
      cb();
    },
  });
  pino({ redact: { paths: LOG_REDACT_PATHS, censor: "[REDACTED]" } }, sink).info(obj, "t");
  return JSON.parse(line) as Record<string, unknown>;
}

describe("LOG_REDACT_PATHS", () => {
  it("redacts banned fields at the top level", () => {
    const out = logOnce({ email: "a@x.io", ip: "203.0.113.7", token: "t", userId: "u1" });

    expect(out["email"]).toBe("[REDACTED]");
    expect(out["ip"]).toBe("[REDACTED]");
    expect(out["token"]).toBe("[REDACTED]");
    expect(out["userId"]).toBe("u1");
  });

  it("redacts banned fields one level down", () => {
    const out = logOnce({ user: { email: "a@x.io", id: "u1" } });

    expect(out["user"]).toEqual({ email: "[REDACTED]", id: "u1" });
  });
});
