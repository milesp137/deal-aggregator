import { getRedis } from "./redis";

/**
 * Tiny key-value layer used by accounts, sessions and email jobs. Upstash Redis in production;
 * an in-memory map (per server instance, lost on restart) when Redis isn't configured, which is
 * only good enough for local development.
 */

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

const globalStore = globalThis as unknown as {
  __dealradarKv?: Map<string, Entry>;
  __dealradarKvSets?: Map<string, Set<string>>;
};
const memory = () => (globalStore.__dealradarKv ??= new Map());
const memorySets = () => (globalStore.__dealradarKvSets ??= new Map());

function readMemory<T>(key: string): T | null {
  const entry = memory().get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    memory().delete(key);
    return null;
  }
  return entry.value as T;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) return (await redis.get<T>(key)) ?? null;
  return readMemory<T>(key);
}

export async function kvSet(key: string, value: unknown, options: { exSeconds?: number } = {}): Promise<void> {
  const redis = getRedis();
  if (redis) {
    if (options.exSeconds) await redis.set(key, value, { ex: options.exSeconds });
    else await redis.set(key, value);
    return;
  }
  memory().set(key, {
    value,
    expiresAt: options.exSeconds ? Date.now() + options.exSeconds * 1000 : null,
  });
}

export async function kvDel(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.del(key);
  else memory().delete(key);
}

/** Reads and deletes in one step, so single-use tokens can't be used twice. */
export async function kvGetDel<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) return ((await redis.getdel<T>(key)) as T | null) ?? null;
  const value = readMemory<T>(key);
  memory().delete(key);
  return value;
}

export async function kvSAdd(key: string, ...members: string[]): Promise<void> {
  if (members.length === 0) return;
  const redis = getRedis();
  if (redis) {
    await redis.sadd(key, members[0], ...members.slice(1));
    return;
  }
  const set = memorySets().get(key) ?? new Set<string>();
  for (const member of members) set.add(member);
  memorySets().set(key, set);
}

export async function kvSMembers(key: string): Promise<string[]> {
  const redis = getRedis();
  if (redis) return ((await redis.smembers(key)) as string[]) ?? [];
  return [...(memorySets().get(key) ?? [])];
}
