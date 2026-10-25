import { NextResponse } from "next/server";
import { getSessionEmail, isJsonRequest } from "@/lib/auth";
import { accountOwner, createAlert, deleteAlert, listAlerts } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/plan";
import { planForRequest } from "@/lib/pro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BROWSER_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * After signing in, moves the alerts this browser created anonymously into the account (skipping
 * duplicates and respecting the plan's alert limit), so nothing is lost by creating an account.
 */
export async function POST(req: Request) {
  if (!isJsonRequest(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const email = await getSessionEmail(req);
  const browserId = req.headers.get("x-client-id") ?? "";
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!BROWSER_ID.test(browserId)) return NextResponse.json({ migrated: 0 });

  try {
    const owner = accountOwner(email);
    const limit = PLAN_LIMITS[await planForRequest(req)].maxAlerts;
    const local = await listAlerts(browserId);
    const existing = new Set((await listAlerts(owner)).map((alert) => alert.keyword.toLowerCase()));

    let migrated = 0;
    for (const alert of local) {
      const keyword = alert.keyword.toLowerCase();
      if (!existing.has(keyword)) {
        const created = await createAlert(
          owner,
          { keyword: alert.keyword, maxPrice: alert.maxPrice, minDealScore: alert.minDealScore },
          limit,
        );
        if (!created) break; // plan limit reached; keep the rest on this browser
        existing.add(keyword);
        migrated += 1;
      }
      await deleteAlert(browserId, alert.id);
    }
    return NextResponse.json({ migrated });
  } catch {
    return NextResponse.json({ error: "Could not move alerts" }, { status: 500 });
  }
}
