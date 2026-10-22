import { randomUUID } from "crypto";
import { Redis } from "@upstash/redis";
import type { AlertKeyword } from "./types";

/**
 * Alert-rule store. Never touches the file system (serverless runtimes like Vercel have a
 * read-only /var/task). Uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set, and
 * falls back to an in-memory array otherwise (per-instance, resets on cold start).
 */

const REDIS_KEY = "dealradar:alerts";

const SEED: Omit<AlertKeyword, "id" | "createdAt">[] = [
  { keyword: "coilover", maxPrice: 1200, minDealScore: 7, enabled: true },
  { keyword: "turbo", maxPrice: 2000, minDealScore: 8, enabled: true },
];

function seedAlerts(): AlertKeyword[] {
  const createdAt = new Date().toISOString();
  return SEED.map((rule) => ({ ...rule, id: randomUUID(), createdAt }));
}

let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = Redis.fromEnv();
  } catch {
    redis = null;
  }
}

// In-memory fallback; kept on globalThis so dev hot-reloads don't reset it.
const globalStore = globalThis as unknown as { __dealradarAlerts?: AlertKeyword[] };

function memory(): AlertKeyword[] {
  if (!globalStore.__dealradarAlerts) globalStore.__dealradarAlerts = seedAlerts();
  return globalStore.__dealradarAlerts;
}

// Serializes read-modify-write cycles so concurrent requests in one instance can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function writeAll(alerts: AlertKeyword[]): Promise<void> {
  // Always mirror to memory so a Redis outage degrades gracefully.
  globalStore.__dealradarAlerts = alerts;
  if (!redis) return;
  try {
    await redis.set(REDIS_KEY, alerts);
  } catch {
    // Redis unavailable: memory copy above remains the source of truth for this instance.
  }
}

async function readAll(): Promise<AlertKeyword[]> {
  if (redis) {
    try {
      const stored = await redis.get<AlertKeyword[]>(REDIS_KEY);
      if (Array.isArray(stored)) {
        globalStore.__dealradarAlerts = stored;
        return stored;
      }
      const seeded = seedAlerts();
      await writeAll(seeded);
      return seeded;
    } catch {
      // fall through to in-memory data
    }
  }
  return memory();
}

export function listAlerts(): Promise<AlertKeyword[]> {
  return withLock(readAll);
}

export interface NewAlertInput {
  keyword: string;
  maxPrice: number | null;
  minDealScore: number;
}

export function createAlert(input: NewAlertInput): Promise<AlertKeyword> {
  return withLock(async () => {
    const alerts = await readAll();
    const alert: AlertKeyword = {
      id: randomUUID(),
      keyword: input.keyword,
      maxPrice: input.maxPrice,
      minDealScore: input.minDealScore,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    await writeAll([alert, ...alerts]);
    return alert;
  });
}

export function updateAlert(
  id: string,
  patch: Partial<Pick<AlertKeyword, "enabled" | "keyword" | "maxPrice" | "minDealScore">>,
): Promise<AlertKeyword | null> {
  return withLock(async () => {
    const alerts = [...(await readAll())];
    const index = alerts.findIndex((alert) => alert.id === id);
    if (index === -1) return null;
    const updated = { ...alerts[index], ...patch };
    alerts[index] = updated;
    await writeAll(alerts);
    return updated;
  });
}

export function deleteAlert(id: string): Promise<boolean> {
  return withLock(async () => {
    const alerts = await readAll();
    const next = alerts.filter((alert) => alert.id !== id);
    if (next.length === alerts.length) return false;
    await writeAll(next);
    return true;
  });
}
