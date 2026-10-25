import { NextResponse } from "next/server";
import { getSessionRecord } from "@/lib/licenses";

export const dynamic = "force-dynamic";

const SESSION_PATTERN = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

/**
 * Lets the post-payment page fetch the license for its own Checkout session. The session id is
 * an unguessable value Stripe puts in the redirect URL, so it acts as the proof of purchase.
 * Returns 202 until the Stripe webhook has issued the key (usually within a few seconds).
 */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!SESSION_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  const record = await getSessionRecord(sessionId);
  if (!record) return NextResponse.json({ ready: false }, { status: 202 });
  return NextResponse.json({ ready: true, key: record.key, email: record.email });
}
