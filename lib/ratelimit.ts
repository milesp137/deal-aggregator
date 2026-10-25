import { getRedis } from "./redis";

interface Bucket {
  count: number;
  resetAt: number;
}

const globalStore = globalThis as unknown as { __dealradarRateLimits?: Map<string, Bucket> };

/**
 * Fixed-window counter. Returns true while `bucket` has been hit at most `limit` times within
 * `windowSec` seconds. Uses Redis when available (shared across serverless instances) and an
 * in-memory map otherwise.
 */
export async function allow(bucket: string, limit: number, windowSec: number): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const key = `dealradar:rl:${bucket}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    return count <= limit;
  }

  const store = (globalStore.__dealradarRateLimits ??= new Map());
  const now = Date.now();
  const current = store.get(bucket);
  if (!current || current.resetAt <= now) {
    store.set(bucket, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}
