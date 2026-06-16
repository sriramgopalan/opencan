// DEPLOYMENT REQUIREMENT: reverse proxy must overwrite x-forwarded-for with the
// real client IP. Without this, guest vote deduplication can be bypassed by
// spoofing the XFF header. See docs/deployment-requirements.md
import { AppError } from "@/lib/errors";
import { redis } from "@/lib/redis";

interface RateLimitOptions {
  max: number;
  windowSeconds: number;
}

export async function rateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<void> {
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, opts.windowSeconds);
  }
  if (count > opts.max) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
    );
  }
}
