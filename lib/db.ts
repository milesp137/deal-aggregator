import { randomUUID } from "crypto";
import { getRedis } from "./redis";
import type { AlertKeyword } from "./types";

/**
 * Per-user alert-rule store. Never touches the file system (serverless runtimes like Vercel
 * have a read-only /var/task). Uses Upstash Redis when configured and falls back to an
 * in-memory map otherwise (per-instance, resets on cold start). Each browser has its own
 * anonymous `ownerId`, so visitors never see each other's alerts.
 */

const redisKey = (ownerId: string) => `dealradar:alerts:${ownerId}`;

/** Owner id for a signed-in account. Browser ids never contain ":", so the two can't collide. */
export const accountOwner = (email: string) => `user:${email.trim().toLowerCase()}`;

// In-memory fallback; kept on globalThis so dev hot-reloads don't reset it.
const globalStore = globalThis as unknown as { __dealradarAlerts?: Map<string, AlertKeyword[]> };

function memory(): Map<string, AlertKeyword[]> {
  if (!globalStore.__dealradarAlerts) globalStore.__dealradarAlerts = new Map();
  return globalStore.__dealradarAlerts;
}

// Serializes read-modify-write cycles so concurrent requests in one instance can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function writeAll(ownerId: string, alerts: AlertKeyword[]): Promise<void> {
  // Always mirror to memory so a Redis outage degrades gracefully.
  memory().set(ownerId, alerts);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(redisKey(ownerId), alerts);
  } catch {
    // Redis unavailable: the memory copy remains the source of truth for this instance.
  }
}

async function readAll(ownerId: string): Promise<AlertKeyword[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const stored = await redis.get<AlertKeyword[]>(redisKey(ownerId));
      if (Array.isArray(stored)) {
        memory().set(ownerId, stored);
        return stored;
      }
      return [];
    } catch {
      // fall through to in-memory data
    }
  }
  return memory().get(ownerId) ?? [];
}

export function listAlerts(ownerId: string): Promise<AlertKeyword[]> {
  return withLock(() => readAll(ownerId));
}

export interface NewAlertInput {
  keyword: string;
  maxPrice: number | null;
  minDealScore: number;
}

/** Creates an alert unless the owner already has `maxAlerts`; returns null when at the limit. */
export function createAlert(
  ownerId: string,
  input: NewAlertInput,
  maxAlerts: number,
): Promise<AlertKeyword | null> {
  return withLock(async () => {
    const alerts = await readAll(ownerId);
    if (alerts.length >= maxAlerts) return null;
    const alert: AlertKeyword = {
      id: randomUUID(),
      keyword: input.keyword,
      maxPrice: input.maxPrice,
      minDealScore: input.minDealScore,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    await writeAll(ownerId, [alert, ...alerts]);
    return alert;
  });
}

export function updateAlert(
  ownerId: string,
  id: string,
  patch: Partial<Pick<AlertKeyword, "enabled" | "keyword" | "maxPrice" | "minDealScore">>,
): Promise<AlertKeyword | null> {
  return withLock(async () => {
    const alerts = [...(await readAll(ownerId))];
    const index = alerts.findIndex((alert) => alert.id === id);
    if (index === -1) return null;
    const updated = { ...alerts[index], ...patch };
    alerts[index] = updated;
    await writeAll(ownerId, alerts);
    return updated;
  });
}

export function deleteAlert(ownerId: string, id: string): Promise<boolean> {
  return withLock(async () => {
    const alerts = await readAll(ownerId);
    const next = alerts.filter((alert) => alert.id !== id);
    if (next.length === alerts.length) return false;
    await writeAll(ownerId, next);
    return true;
  });
}
