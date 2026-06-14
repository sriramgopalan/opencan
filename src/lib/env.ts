import { z } from "zod";

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
    throw new Error(
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
