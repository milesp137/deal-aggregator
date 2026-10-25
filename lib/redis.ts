import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

/** Shared Upstash client, or null when the env vars are missing (callers fall back to memory). */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      client = Redis.fromEnv();
    } catch {
      client = null;
    }
  } else {
    client = null;
  }
  return client;
}
