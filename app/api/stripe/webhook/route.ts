import { NextResponse } from "next/server";
import { sendLicenseEmail } from "@/lib/email";
import {
  activateKey,
  createSessionRecord,
  generateLicenseKey,
  getSessionRecord,
  revokeByRefs,
  saveSessionRecord,
} from "@/lib/licenses";
import { verifyStripeSignature } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StripeObject {
  id?: string;
  customer?: string | null;
  subscription?: string | null;
  payment_intent?: string | null;
  payment_link?: string | null;
  payment_status?: string;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
  refunded?: boolean;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeObject };
}

/** Issues (or re-sends) the license for a paid Checkout session. Safe to run more than once. */
async function fulfill(session: StripeObject): Promise<void> {
  const sessionId = session.id;
  if (!sessionId) return;

  // Optional guard so other products in the same Stripe account don't grant Pro.
  const onlyLink = process.env.STRIPE_PAYMENT_LINK_ID;
  if (onlyLink && session.payment_link !== onlyLink) return;

  const email = session.customer_details?.email ?? session.customer_email ?? null;

  const existing = await getSessionRecord(sessionId);
  if (existing) {
    // Stripe retried the webhook. Just make sure the email went out.
    if (!existing.emailed && email) {
      const emailed = await sendLicenseEmail(email, existing.key);
      if (emailed) await saveSessionRecord(sessionId, { ...existing, emailed: true });
    }
    return;
  }

  const record = { key: generateLicenseKey(), email, emailed: false, createdAt: new Date().toISOString() };
  const created = await createSessionRecord(sessionId, record);
  if (!created) return; // another delivery of the same event won the race

  await activateKey(record.key, [session.customer, session.subscription, session.payment_intent]);
  console.log(`[license] issued key for session ${sessionId}`);

  if (email) {
    const emailed = await sendLicenseEmail(email, record.key);
    if (emailed) await saveSessionRecord(sessionId, { ...record, emailed: true });
  }
}

export async function POST(req: Request) {
  // One or more signing secrets, comma separated. List both your test-mode and live-mode
  // secrets ("whsec_test...,whsec_live...") so one deployment can serve both.
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (secrets.length === 0) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Signature verification needs the exact raw body.
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!secrets.some((secret) => verifyStripeSignature(payload, signature, secret))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const object = event.data.object;
    switch (event.type) {
      case "checkout.session.completed":
        // Card payments are "paid" immediately; delayed methods arrive via async_payment_succeeded.
        if (object.payment_status === "paid" || object.payment_status === "no_payment_required") {
          await fulfill(object);
        }
        break;
      case "checkout.session.async_payment_succeeded":
        await fulfill(object);
        break;
      case "customer.subscription.deleted": {
        const revoked = await revokeByRefs([object.id, object.customer]);
        if (revoked.length) console.log(`[license] revoked ${revoked.length} key(s): subscription ended`);
        break;
      }
      case "charge.refunded":
        if (object.refunded) {
          const revoked = await revokeByRefs([object.payment_intent, object.customer]);
          if (revoked.length) console.log(`[license] revoked ${revoked.length} key(s): charge refunded`);
        }
        break;
      default:
        break; // other events are ignored
    }
  } catch (error) {
    // A 500 makes Stripe retry the delivery later.
    console.error(`[stripe] handling ${event.type} failed:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
