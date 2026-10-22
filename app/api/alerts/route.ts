import { NextResponse } from "next/server";
import { createAlert, deleteAlert, listAlerts, updateAlert } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** null / "" / undefined -> null (no limit). Valid positive number -> number. Anything else -> undefined (invalid). */
function parseMaxPrice(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function parseMinScore(value: unknown): number | undefined {
  if (value === undefined) return 1;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : undefined;
}

export async function GET() {
  return NextResponse.json({ alerts: await listAlerts() }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body) return badRequest("Request body must be a JSON object.");

  const keyword = typeof body.keyword === "string" ? body.keyword.trim().slice(0, 80) : "";
  if (!keyword) return badRequest("keyword is required.");

  const maxPrice = parseMaxPrice(body.maxPrice);
  if (maxPrice === undefined) return badRequest("maxPrice must be a positive number.");

  const minDealScore = parseMinScore(body.minDealScore);
  if (minDealScore === undefined) return badRequest("minDealScore must be an integer from 1 to 10.");

  const alert = await createAlert({ keyword, maxPrice, minDealScore });
  return NextResponse.json({ alert }, { status: 201, headers: NO_STORE });
}

export async function PATCH(req: Request) {
  const body = await readBody(req);
  if (!body || typeof body.id !== "string") return badRequest("id is required.");
  if (typeof body.enabled !== "boolean") return badRequest("enabled must be a boolean.");

  const alert = await updateAlert(body.id, { enabled: body.enabled });
  if (!alert) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  return NextResponse.json({ alert }, { headers: NO_STORE });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id query parameter is required.");

  const removed = await deleteAlert(id);
  if (!removed) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
