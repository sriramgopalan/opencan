import { z } from "zod";

import { AppError } from "@/lib/errors";

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    AUTH_URL: z.string().url().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM: z.string().email(),
    REDIS_URL: z.string().min(1),
    // Random 32-byte hex string for HMAC IP hashing. Generate: openssl rand -hex 32
    IP_HASH_SECRET: z.string().default("opencan-default-salt"),
    // Maximum number of registered webhooks per instance (default 10)
    WEBHOOK_MAX: z.coerce.number().int().min(1).max(100).default(10),
    // Optional: HS256 signing secret for widget JWT auto-login (must be ≥ 32 chars)
    WIDGET_JWT_SECRET: z.string().min(32).optional(),
    // Optional: space-separated origins allowed to frame embed pages (e.g. "https://app.acme.com")
    WIDGET_ALLOWED_ORIGINS: z.string().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .superRefine((data, ctx) => {
    if (
      data.NODE_ENV === "production" &&
      !process.env["CI"] &&
      data.AUTH_URL &&
      !data.AUTH_URL.startsWith("https://")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_URL"],
        message: "AUTH_URL must use HTTPS in production",
      });
    }
  });

export { schema as envSchema };

type Env = z.infer<typeof schema>;

function getEnv(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    if (process.env["NEXT_PHASE"] === "phase-production-build") {
      return { LOG_LEVEL: "silent", NODE_ENV: "production" } as unknown as Env;
    }
    throw new AppError(
      "INTERNAL_ERROR",
      `Invalid environment variables:\n${JSON.stringify(
        result.error.flatten().fieldErrors,
        null,
        2,
      )}`,
    );
  }
  return result.data;
}

export const env = getEnv();
