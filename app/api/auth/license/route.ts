import { NextResponse } from "next/server";
import { createSession, getSessionEmail, isJsonRequest, sessionCookie, upsertUser } from "@/lib/auth";
import { emailForKey, normalizeEmail } from "@/lib/licenses";
import { isValidLicense } from "@/lib/pro";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signs a browser in using the Pro license key it already has saved, as the email that bought
 * it. This is what keeps a paying customer signed in on a device without another email link.
 * A key is only ever sent by the browser that holds it, and knowing it already grants Pro.
 */
export async function POST(req: Request) {
  if (!isJsonRequest(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await allow(`licenselogin:${ip}`, 30, 3600))) {
    return NextResponse.json({ signedIn: false }, { status: 429 });
  }

  let key = "";
  try {
    const body = (await req.json()) as { key?: unknown };
    key = typeof body.key === "string" ? body.key.trim() : "";
  } catch {
    // handled below
  }

  try {
    if (!(await isValidLicense(key))) return NextResponse.json({ signedIn: false });
    const email = await emailForKey(key);
    if (!email) return NextResponse.json({ signedIn: false }); // key has no account email

    const user = await upsertUser(email);
    const response = NextResponse.json({
      signedIn: true,
      email: user.email,
      plan: "pro",
      emailAlerts: user.emailAlerts,
      marketing: user.marketing,
    });
    // Keep an existing session for this same email; otherwise start one.
    if ((await getSessionEmail(req)) !== normalizeEmail(email)) {
      response.cookies.set(sessionCookie(await createSession(user.email)));
    }
    return response;
  } catch (error) {
    console.error("[auth] license sign-in failed:", error);
    return NextResponse.json({ signedIn: false });
  }
}
