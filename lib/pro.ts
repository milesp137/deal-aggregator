import { PLAN_LIMITS, type Plan, type PlanLimits } from "./plan";
import { isKeyActive } from "./licenses";

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

export async function planForRequest(req: Request): Promise<Plan> {
  return (await isValidLicense(req.headers.get("x-license-key"))) ? "pro" : "free";
}

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
