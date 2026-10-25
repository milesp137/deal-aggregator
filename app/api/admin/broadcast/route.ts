import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getUser, USERS_SET } from "@/lib/auth";
import { kvSAdd, kvSMembers } from "@/lib/kv";
import { marketingEmail, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEADLINE_MS = 50_000;
const SEND_GAP_MS = 600; // stays under Resend's default 2 requests/second

function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const stripTags = (html: string) =>
  html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim();

/**
 * Sends a marketing email to every opted-in user.
 *
 *   POST /api/admin/broadcast    Authorization: Bearer <ADMIN_TOKEN>
 *   { "campaignId": "oct-deals", "subject": "...", "html": "<p>...</p>", "testTo": "me@example.com" }
 *
 * - `testTo` sends one preview to that address only and records nothing.
 * - Each campaignId is delivered at most once per person, so if a run stops early (time limit)
 *   just call it again and it carries on with whoever hasn't received it.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { campaignId?: unknown; subject?: unknown; html?: unknown; testTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  const testTo = typeof body.testTo === "string" ? body.testTo.trim() : "";

  if (!/^[a-z0-9-]{3,60}$/i.test(campaignId)) {
    return NextResponse.json({ error: "campaignId must be 3-60 letters, numbers or dashes" }, { status: 400 });
  }
  if (!subject || !html) return NextResponse.json({ error: "subject and html are required" }, { status: 400 });
  if (!(process.env.MAIL_FOOTER_ADDRESS ?? "").trim()) {
    return NextResponse.json(
      { error: "Set MAIL_FOOTER_ADDRESS (a mailing address or PO box) first. Marketing email must include one." },
      { status: 400 },
    );
  }
  const text = stripTags(html);

  if (testTo) {
    const ok = await sendMail({ to: testTo, ...marketingEmail(null, `[Test] ${subject}`, html, text) });
    return NextResponse.json({ test: true, sent: ok });
  }

  const deliveredKey = `dealradar:campaign:${campaignId}`;
  const delivered = new Set(await kvSMembers(deliveredKey));
  const startedAt = Date.now();
  let sent = 0;
  let failed = 0;
  let alreadyReceived = 0;
  let timedOut = false;

  for (const email of await kvSMembers(USERS_SET)) {
    if (delivered.has(email)) {
      alreadyReceived += 1;
      continue;
    }
    const user = await getUser(email);
    if (!user || !user.marketing) continue;

    if (Date.now() - startedAt > DEADLINE_MS) {
      timedOut = true;
      break;
    }
    const ok = await sendMail({ to: email, ...marketingEmail(user, subject, html, text) });
    if (ok) {
      await kvSAdd(deliveredKey, email);
      sent += 1;
    } else {
      failed += 1;
    }
    await sleep(SEND_GAP_MS);
  }

  return NextResponse.json({ campaignId, sent, failed, alreadyReceived, timedOut });
}
