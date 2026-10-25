import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createLoginToken, EMAIL_PATTERN, isJsonRequest } from "@/lib/auth";
import { SITE_URL } from "@/lib/email";
import { normalizeEmail } from "@/lib/licenses";
import { loginEmail, sendMail } from "@/lib/mail";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_IP_LIMIT = 8; // sign-in emails per hour
const PER_EMAIL_LIMIT = 4;

/**
 * Step 1 of sign-in: mail a single-use link. The response never says whether the address
 * already has an account.
 */
export async function POST(req: Request) {
  if (!isJsonRequest(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let rawEmail = "";
  let marketing = false;
  try {
    const body = (await req.json()) as { email?: unknown; marketing?: unknown };
    rawEmail = typeof body.email === "string" ? body.email : "";
    marketing = body.marketing === true;
  } catch {
    // validated below
  }

  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await allow(`login:ip:${ip}`, PER_IP_LIMIT, 3600))) {
    return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
  }
  const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 32);
  if (!(await allow(`login:email:${emailHash}`, PER_EMAIL_LIMIT, 3600))) {
    // Looks identical to success; the address already has recent links waiting.
    return NextResponse.json({ ok: true });
  }

  try {
    const token = await createLoginToken(email, marketing);
    // The token travels in the URL fragment, so it never lands in server or proxy logs.
    const link = `${SITE_URL}/auth/verify#token=${token}`;
    const sent = await sendMail({ to: email, ...loginEmail(link) });
    if (!sent) {
      return NextResponse.json({ error: "Couldn't send the email right now. Try again in a minute." }, { status: 502 });
    }
  } catch (error) {
    console.error("[auth] request failed:", error);
    return NextResponse.json({ error: "Something went wrong. Try again in a minute." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
