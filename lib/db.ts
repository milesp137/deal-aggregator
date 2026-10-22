import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { AlertKeyword } from "./types";

/**
 * Tiny file-backed "database" for alert rules (data/alerts.json). Zero native dependencies,
 * so it works on any OS. The shape matches the AlertKeyword table you would create in
 * SQLite/Postgres later, so swapping the storage layer only touches this file.
 */

const DB_PATH = path.join(process.cwd(), "data", "alerts.json");

const SEED: Omit<AlertKeyword, "id" | "createdAt">[] = [
  { keyword: "240sx", maxPrice: 13000, minDealScore: 6, enabled: true },
  { keyword: "rtx 4090", maxPrice: 1200, minDealScore: 6, enabled: true },
];

// Serializes read-modify-write cycles so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function writeAll(alerts: AlertKeyword[]): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(alerts, null, 2), "utf8");
}

async function readAll(): Promise<AlertKeyword[]> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AlertKeyword[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const seeded: AlertKeyword[] = SEED.map((rule) => ({
      ...rule,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }));
    await writeAll(seeded);
    return seeded;
  }
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
    const alerts = await readAll();
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
