import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/auth";
import { accountOwner, createAlert, deleteAlert, listAlerts, updateAlert } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/plan";
import { planForRequest } from "@/lib/pro";

// Storage (Upstash Redis with in-memory fallback) lives in lib/db.ts; no file-system access here.
export const dynamic = "force-dynamic";

const OWNER_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Signed-in visitors own their alerts through their account (so they follow them across
 * devices and can be emailed); everyone else gets a private list per browser via an anonymous id.
 */
async function ownerOf(req: Request): Promise<string | null> {
  const email = await getSessionEmail(req);
  if (email) return accountOwner(email);
  const id = req.headers.get("x-client-id") ?? "";
  return OWNER_PATTERN.test(id) ? id : null;
}

const missingOwner = () => NextResponse.json({ error: "Missing client id" }, { status: 400 });

export async function GET(req: Request) {
  const owner = await ownerOf(req);
  if (!owner) return missingOwner();
  try {
    return NextResponse.json({ alerts: await listAlerts(owner) });
  } catch {
    return NextResponse.json({ error: "Failed to load alerts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const owner = await ownerOf(req);
  if (!owner) return missingOwner();
  try {
    const body = await req.json();
    const keyword = typeof body.keyword === "string" ? body.keyword.trim().slice(0, 80) : "";
    if (!keyword) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }
    const plan = await planForRequest(req);
    const limit = PLAN_LIMITS[plan].maxAlerts;
    const alert = await createAlert(
      owner,
      {
        keyword,
        maxPrice: typeof body.maxPrice === "number" ? body.maxPrice : null,
        minDealScore: typeof body.minDealScore === "number" ? body.minDealScore : 1,
      },
      limit,
    );
    if (!alert) {
      return NextResponse.json(
        {
          error:
            plan === "free"
              ? `Free plan includes ${limit} alert. Upgrade to Pro for up to ${PLAN_LIMITS.pro.maxAlerts}.`
              : `Alert limit of ${limit} reached.`,
          code: "PRO_REQUIRED",
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ alert });
  } catch {
    return NextResponse.json({ error: "Failed to create alert" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const owner = await ownerOf(req);
  if (!owner) return missingOwner();
  try {
    const { id, enabled } = await req.json();
    const alert = await updateAlert(owner, id, { enabled: Boolean(enabled) });
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json({ alert });
  } catch {
    return NextResponse.json({ error: "Failed to update alert" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const owner = await ownerOf(req);
  if (!owner) return missingOwner();
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) await deleteAlert(owner, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete alert" }, { status: 500 });
  }
}
