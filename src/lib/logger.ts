// eslint-disable-next-line import/no-named-as-default
import pino from "pino";

import { env } from "@/lib/env";

export const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
      "*.apiKey",
      "*.creditCard",
      "*.email",
      "*.name",
    ],
    censor: "[REDACTED]",
  },
  ...(env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  }),
});
