import { PLAN_LIMITS, type Plan, type PlanLimits } from "./plan";
import { getSessionEmail } from "./auth";
import { findRecordsByEmail, isKeyActive, normalizeEmail } from "./licenses";

/**
 * Pro entitlement via license keys. A key is valid if it was issued by the Stripe webhook
 * (stored in the Redis set `dealradar:pro_keys`) or is listed in the optional PRO_LICENSE_KEYS
 * env var (comma separated), which is handy for comped/test keys.
 */

const KEY_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export async function isValidLicense(key: string | null | undefined): Promise<boolean> {
  const candidate = (key ?? "").trim();
  if (!KEY_PATTERN.test(candidate)) return false;

  const envKeys = (process.env.PRO_LICENSE_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (envKeys.includes(candidate)) return true;

  try {
    return await isKeyActive(candidate);
  } catch {
    return false;
  }
}

/** An email is Pro if it bought a license that is still active, or is a comped address in PRO_EMAILS. */
export async function isProEmail(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const comped = (process.env.PRO_EMAILS ?? "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
  if (comped.includes(email)) return true;
  try {
    for (const record of await findRecordsByEmail(email)) {
      if (await isKeyActive(record.key)) return true;
    }
  } catch {
    // storage hiccup: treat as Free rather than failing the request
  }
  return false;
}

/** Pro if the request carries a valid license key, or is signed in to an account that has Pro. */
export async function planForRequest(req: Request): Promise<Plan> {
  if (await isValidLicense(req.headers.get("x-license-key"))) return "pro";
  const email = await getSessionEmail(req);
  return email && (await isProEmail(email)) ? "pro" : "free";
}

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
