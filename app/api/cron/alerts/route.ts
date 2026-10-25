import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runAlertEmails } from "@/lib/alertEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; external pingers can use the same header.
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** Runs the email-alert job. Called by Vercel Cron (daily) or any external scheduler. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runAlertEmails(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[alerts] run failed:", error);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
