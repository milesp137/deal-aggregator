import { randomBytes } from "crypto";
import { getRedis } from "./redis";

/**
 * License storage. Redis (Upstash) in production; falls back to in-memory (per instance, resets
 * on restart) when Redis isn't configured, which is fine for local development only.
 *
 *   dealradar:pro_keys                   set of ACTIVE license keys
 *   dealradar:license:session:<id>       JSON record for a Stripe Checkout session
 *   dealradar:license:ref:<stripe id>    customer / subscription / payment_intent -> key (for revokes)
 */

export const PRO_KEYS_SET = "dealradar:pro_keys";
const sessionKey = (sessionId: string) => `dealradar:license:session:${sessionId}`;
const refKey = (ref: string) => `dealradar:license:ref:${ref}`;

export interface LicenseRecord {
  key: string;
  email: string | null;
  emailed: boolean;
  createdAt: string;
}

interface MemoryStore {
  active: Set<string>;
  sessions: Map<string, LicenseRecord>;
  refs: Map<string, string>;
}

const globalStore = globalThis as unknown as { __dealradarLicenses?: MemoryStore };
function memory(): MemoryStore {
  if (!globalStore.__dealradarLicenses) {
    globalStore.__dealradarLicenses = { active: new Set(), sessions: new Map(), refs: new Map() };
  }
  return globalStore.__dealradarLicenses;
}

/** "PRO-" + 20 random hex chars, e.g. PRO-9F2C41B7A0D35E68C1AB. */
export function generateLicenseKey(): string {
  return `PRO-${randomBytes(10).toString("hex").toUpperCase()}`;
}

export async function getSessionRecord(sessionId: string): Promise<LicenseRecord | null> {
  const redis = getRedis();
  if (redis) return (await redis.get<LicenseRecord>(sessionKey(sessionId))) ?? null;
  return memory().sessions.get(sessionId) ?? null;
}

/** Stores the record only if none exists yet. Returns true when this call created it. */
export async function createSessionRecord(sessionId: string, record: LicenseRecord): Promise<boolean> {
  const redis = getRedis();
  if (redis) return (await redis.set(sessionKey(sessionId), record, { nx: true })) === "OK";
  const store = memory();
  if (store.sessions.has(sessionId)) return false;
  store.sessions.set(sessionId, record);
  return true;
}

export async function saveSessionRecord(sessionId: string, record: LicenseRecord): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.set(sessionKey(sessionId), record);
  else memory().sessions.set(sessionId, record);
}

export async function activateKey(key: string, refs: (string | null | undefined)[]): Promise<void> {
  const redis = getRedis();
  const linked = refs.filter((ref): ref is string => Boolean(ref));
  if (redis) {
    await redis.sadd(PRO_KEYS_SET, key);
    await Promise.all(linked.map((ref) => redis.set(refKey(ref), key)));
    return;
  }
  const store = memory();
  store.active.add(key);
  for (const ref of linked) store.refs.set(ref, key);
}

/** Deactivates the key linked to any of the Stripe ids (subscription canceled, charge refunded). */
export async function revokeByRefs(refs: (string | null | undefined)[]): Promise<string[]> {
  const redis = getRedis();
  const revoked: string[] = [];
  for (const ref of refs) {
    if (!ref) continue;
    const key = redis ? await redis.get<string>(refKey(ref)) : (memory().refs.get(ref) ?? null);
    if (!key) continue;
    if (redis) await redis.srem(PRO_KEYS_SET, key);
    else memory().active.delete(key);
    revoked.push(key);
  }
  return revoked;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const emailKey = (email: string) => `dealradar:license:email:${normalizeEmail(email)}`;
const SESSION_PREFIX = "dealradar:license:session:";
const BACKFILL_MARKER = "dealradar:license:email_index_built";

/** Remembers which checkout sessions belong to an email so lost keys can be re-sent. */
export async function indexEmail(email: string | null, sessionId: string): Promise<void> {
  if (!email) return;
  const redis = getRedis();
  if (redis) await redis.sadd(emailKey(email), sessionId);
  // The in-memory store is searched directly, so it needs no separate index.
}

/**
 * Purchases made before the email index existed are indexed once, the first time anyone asks
 * for a key. Gives up quietly (and retries next time) if the scan doesn't finish.
 */
async function backfillEmailIndex(): Promise<void> {
  const redis = getRedis();
  if (!redis || (await redis.get(BACKFILL_MARKER))) return;

  let cursor = "0";
  let rounds = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${SESSION_PREFIX}*`, count: 200 });
    cursor = String(next);
    if (keys.length > 0) {
      const records = await redis.mget<(LicenseRecord | null)[]>(...keys);
      await Promise.all(
        records.map((record, index) =>
          record?.email ? indexEmail(record.email, keys[index].slice(SESSION_PREFIX.length)) : null,
        ),
      );
    }
    rounds += 1;
  } while (cursor !== "0" && rounds < 50);

  if (cursor === "0") await redis.set(BACKFILL_MARKER, "1");
}

/** All license records bought with this email, newest first. */
export async function findRecordsByEmail(email: string): Promise<LicenseRecord[]> {
  const target = normalizeEmail(email);
  const redis = getRedis();
  let records: LicenseRecord[];

  if (redis) {
    await backfillEmailIndex();
    const ids = (await redis.smembers(emailKey(target))) as string[];
    const found = await Promise.all(ids.map((id) => getSessionRecord(id)));
    records = found.filter((record): record is LicenseRecord => record !== null);
  } else {
    records = [...memory().sessions.values()].filter(
      (record) => record.email !== null && normalizeEmail(record.email) === target,
    );
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const keyEmailKey = (key: string) => `dealradar:license:keyemail:${key}`;

/**
 * The email a license key was bought with, or null (e.g. keys that only exist in PRO_LICENSE_KEYS).
 * The first lookup for a key scans the purchase records once; the answer is then cached.
 * Callers must check the key is active first so random keys never trigger the scan.
 */
export async function emailForKey(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) {
    for (const record of memory().sessions.values()) {
      if (record.key === key && record.email) return normalizeEmail(record.email);
    }
    return null;
  }

  const cached = await redis.get<string>(keyEmailKey(key));
  if (cached) return cached;

  let cursor = "0";
  let rounds = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${SESSION_PREFIX}*`, count: 200 });
    cursor = String(next);
    if (keys.length > 0) {
      const records = await redis.mget<(LicenseRecord | null)[]>(...keys);
      const match = records.find((record) => record?.key === key && record.email);
      if (match?.email) {
        const email = normalizeEmail(match.email);
        await redis.set(keyEmailKey(key), email);
        return email;
      }
    }
    rounds += 1;
  } while (cursor !== "0" && rounds < 50);
  return null;
}

export async function isKeyActive(key: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) return (await redis.sismember(PRO_KEYS_SET, key)) === 1;
  return memory().active.has(key);
}
