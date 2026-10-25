import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies a Stripe webhook signature (https://docs.stripe.com/webhooks#verify-manually).
 * `payload` must be the raw, unparsed request body.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [name, value] = part.split("=");
    if (name === "t") timestamp = value ?? "";
    else if (name === "v1" && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some(
    (signature) =>
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
  );
}
