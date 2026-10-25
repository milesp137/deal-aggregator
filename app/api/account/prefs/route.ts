import { NextResponse } from "next/server";
import { getSessionUser, isJsonRequest, saveUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Updates the signed-in user's email preferences and search location. */
export async function POST(req: Request) {
  if (!isJsonRequest(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const body = (await req.json()) as {
      emailAlerts?: unknown;
      marketing?: unknown;
      location?: { lat?: unknown; lng?: unknown; label?: unknown } | null;
    };

    const updated = { ...user };
    if (typeof body.emailAlerts === "boolean") updated.emailAlerts = body.emailAlerts;
    if (typeof body.marketing === "boolean") updated.marketing = body.marketing;

    const place = body.location;
    if (place && typeof place === "object") {
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        updated.location = {
          lat,
          lng,
          label: typeof place.label === "string" ? place.label.slice(0, 80) : "",
        };
      }
    }

    await saveUser(updated);
    return NextResponse.json({ ok: true, emailAlerts: updated.emailAlerts, marketing: updated.marketing });
  } catch {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
