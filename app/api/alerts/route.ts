import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const DEFAULT_ALERTS = [
  { id: "1", keyword: "coilover", maxPrice: 1200, minDealScore: 7, enabled: true },
  { id: "2", keyword: "turbo", maxPrice: 2000, minDealScore: 8, enabled: true },
];

let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = Redis.fromEnv();
  } catch {
    redis = null;
  }
}

const REDIS_KEY = "dealradar:alerts";

export async function GET() {
  try {
    if (redis) {
      const alerts = await redis.get(REDIS_KEY);
      if (alerts) {
        return NextResponse.json({ alerts });
      }
      await redis.set(REDIS_KEY, DEFAULT_ALERTS);
    }
    return NextResponse.json({ alerts: DEFAULT_ALERTS });
  } catch {
    return NextResponse.json({ alerts: DEFAULT_ALERTS });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const newAlert = {
      id: Date.now().toString(),
      keyword: body.keyword,
      maxPrice: body.maxPrice ?? null,
      minDealScore: body.minDealScore ?? 1,
      enabled: true,
    };

    if (redis) {
      const currentAlerts: any[] = (await redis.get(REDIS_KEY)) || DEFAULT_ALERTS;
      const updated = [newAlert, ...currentAlerts];
      await redis.set(REDIS_KEY, updated);
    }

    return NextResponse.json({ alert: newAlert });
  } catch {
    return NextResponse.json({ error: "Failed to create alert" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, enabled } = await req.json();
    let currentAlerts = DEFAULT_ALERTS;

    if (redis) {
      currentAlerts = (await redis.get(REDIS_KEY)) || DEFAULT_ALERTS;
      currentAlerts = currentAlerts.map((a) => (a.id === id ? { ...a, enabled } : a));
      await redis.set(REDIS_KEY, currentAlerts);
    }

    const updated = currentAlerts.find((a) => a.id === id) || { id, enabled };
    return NextResponse.json({ alert: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update alert" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (redis && id) {
      let currentAlerts: any[] = (await redis.get(REDIS_KEY)) || DEFAULT_ALERTS;
      currentAlerts = currentAlerts.filter((a) => a.id !== id);
      await redis.set(REDIS_KEY, currentAlerts);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete alert" }, { status: 500 });
  }
}