import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { redis } from "@/lib/redis";

const KEY_PREFIX = "session:blocklist:user:";
const TTL_30_DAYS = SESSION_MAX_AGE_SECONDS;

export async function addToBlocklist(userId: string, ttlSeconds = TTL_30_DAYS): Promise<void> {
  await redis.set(`${KEY_PREFIX}${userId}`, "1", "EX", ttlSeconds);
}

export async function isBlocklisted(userId: string): Promise<boolean> {
  return (await redis.exists(`${KEY_PREFIX}${userId}`)) === 1;
}

export async function removeFromBlocklist(userId: string): Promise<void> {
  await redis.del(`${KEY_PREFIX}${userId}`);
}
