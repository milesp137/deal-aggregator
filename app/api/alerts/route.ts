import { NextResponse } from "next/server";
import { createAlert, deleteAlert, listAlerts, updateAlert } from "@/lib/db";

// Storage (Upstash Redis with in-memory fallback) lives in lib/db.ts; no file-system access here.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ alerts: await listAlerts() });
  } catch {
    return NextResponse.json({ error: "Failed to load alerts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
    if (!keyword) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }
    const alert = await createAlert({
      keyword,
      maxPrice: body.maxPrice ?? null,
      minDealScore: body.minDealScore ?? 1,
    });
    return NextResponse.json({ alert });
  } catch {
    return NextResponse.json({ error: "Failed to create alert" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, enabled } = await req.json();
    const alert = await updateAlert(id, { enabled });
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json({ alert });
  } catch {
    return NextResponse.json({ error: "Failed to update alert" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) await deleteAlert(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete alert" }, { status: 500 });
  }
}
