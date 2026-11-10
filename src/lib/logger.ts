// eslint-disable-next-line import/no-named-as-default
import pino from "pino";

import { env } from "@/lib/env";

// Banned fields (privacy.md / security.md). Each is redacted at the top level and one
// level down: pino's "*.x" wildcard does NOT match a top-level "x". The ESLint
// rule blocks these keys in logger calls; this is the backstop for objects it can't see.
const REDACTED_FIELDS = [
  "password",
  "passwordHash",
  "token",
  "secret",
  "apiKey",
  "creditCard",
  "email",
  "name",
  "ip",
  "ipAddress",
  "userAgent",
] as const;

export const LOG_REDACT_PATHS = REDACTED_FIELDS.flatMap((f) => [f, `*.${f}`]);

export const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  redact: {
    paths: LOG_REDACT_PATHS,
    censor: "[REDACTED]",
  },
  ...(env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  }),
});
