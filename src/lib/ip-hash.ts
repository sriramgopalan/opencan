import { createHmac } from "crypto";

import { env } from "@/lib/env";

/**
 * Keyed hash of a client IP. Use it anywhere an IP would otherwise be stored or
 * used as a key (Redis rate limits, guest vote dedup). privacy.md: raw IPs are
 * never stored or logged.
 */
export function hashIp(ip: string): string {
  return createHmac("sha256", env.IP_HASH_SECRET).update(ip).digest("hex");
}
