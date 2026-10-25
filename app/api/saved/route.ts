import { NextResponse } from "next/server";
import { getSessionEmail, isJsonRequest } from "@/lib/auth";
import { kvGet, kvSet } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 200;
const MAX_BYTES = 900_000;

const savedKey = (email: string) => `dealradar:saved:${email}`;

interface SavedItem {
  listing: { id: string };
  savedAt: string;
  savedPrice: number;
}

function isSavedItem(value: unknown): value is SavedItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as SavedItem;
  return (
    typeof item.listing?.id === "string" &&
    item.listing.id.length <= 200 &&
    typeof item.savedPrice === "number" &&
    typeof item.savedAt === "string"
  );
}

/** The signed-in user's saved listings, synced across their devices. */
export async function GET(req: Request) {
  const email = await getSessionEmail(req);
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const saved = await kvGet<SavedItem[]>(savedKey(email));
    return NextResponse.json({ saved: Array.isArray(saved) ? saved : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load saved listings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!isJsonRequest(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const email = await getSessionEmail(req);
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const body = (await req.json()) as { saved?: unknown };
    if (!Array.isArray(body.saved) || body.saved.length > MAX_ITEMS || !body.saved.every(isSavedItem)) {
      return NextResponse.json({ error: "Invalid saved list" }, { status: 400 });
    }
    if (JSON.stringify(body.saved).length > MAX_BYTES) {
      return NextResponse.json({ error: "Saved list is too large" }, { status: 413 });
    }
    await kvSet(savedKey(email), body.saved);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
