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

export async function isKeyActive(key: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) return (await redis.sismember(PRO_KEYS_SET, key)) === 1;
  return memory().active.has(key);
}
