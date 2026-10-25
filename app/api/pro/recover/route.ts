import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { sendLicenseEmail } from "@/lib/email";
import { findRecordsByEmail, isKeyActive, normalizeEmail } from "@/lib/licenses";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PER_IP_LIMIT = 5; // requests per hour
const PER_EMAIL_LIMIT = 2; // emails per hour to the same address

/**
 * "Email me my key". The key is only ever sent to the address that paid; it is never returned in
 * the response, and the response is identical whether or not the email has a purchase, so this
 * can't be used to find out who is a customer.
 */
export async function POST(req: Request) {
  let raw = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    raw = typeof body.email === "string" ? body.email : "";
  } catch {
    // fall through to validation
  }

  const email = normalizeEmail(raw);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await allow(`recover:ip:${ip}`, PER_IP_LIMIT, 3600))) {
    return NextResponse.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });
  }

  const response = NextResponse.json({ ok: true });

  const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 32);
  if (!(await allow(`recover:email:${emailHash}`, PER_EMAIL_LIMIT, 3600))) return response;

  try {
    const records = await findRecordsByEmail(email);
    for (const record of records) {
      if (await isKeyActive(record.key)) {
        await sendLicenseEmail(email, record.key, { recovery: true });
        console.log("[license] recovery email sent");
        break; // newest active key only
      }
    }
  } catch (error) {
    console.error("[license] recovery failed:", error);
  }
  return response;
}
