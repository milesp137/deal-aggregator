/** Free vs Pro plan definitions, shared by the API (enforcement) and the UI (messaging). */

export type Plan = "free" | "pro";

export interface PlanLimits {
  /** Most listings returned per search. */
  maxResults: number;
  /** Most keyword alert rules a user can keep. */
  maxAlerts: number;
  /** Farthest search radius in miles (1500 = nationwide). */
  maxDistance: number;
  /** Listings newer than this many minutes are hidden (0 = instant access). */
  freshDelayMinutes: number;
  /** Live auto-refresh polling. */
  autoRefresh: boolean;
  /** Desktop notifications when an alert matches. */
  notifications: boolean;
  /** Most listings a visitor can save to their watchlist. */
  maxSaved: number;
  /** Fewest minutes between alert emails to one person (Free gets a daily digest). */
  emailAlertCooldownMinutes: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxResults: 15,
    maxAlerts: 1,
    maxDistance: 100,
    freshDelayMinutes: 15,
    autoRefresh: false,
    notifications: false,
    maxSaved: 10,
    emailAlertCooldownMinutes: 24 * 60,
  },
  pro: {
    maxResults: 500,
    maxAlerts: 25,
    maxDistance: 1500,
    freshDelayMinutes: 0,
    autoRefresh: true,
    notifications: true,
    maxSaved: 200,
    emailAlertCooldownMinutes: 20,
  },
};

export const FREE_MAX_DISTANCE = PLAN_LIMITS.free.maxDistance;

export const UPGRADE_URL = "https://buy.stripe.com/4gMdR91zv94NcnWfi27bW02";

/**
 * Stripe Customer Portal login link (Stripe Dashboard -> Settings -> Billing -> Customer portal).
 * Set NEXT_PUBLIC_BILLING_PORTAL_URL in Vercel; when empty the "Manage subscription" links are hidden.
 */
export const BILLING_PORTAL_URL = (process.env.NEXT_PUBLIC_BILLING_PORTAL_URL || "").trim();

/**
 * Where people write when they lose a license key. Set NEXT_PUBLIC_SUPPORT_EMAIL in Vercel
 * (use an address that actually receives mail); when empty the contact lines are hidden.
 */
export const SUPPORT_EMAIL = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "").trim();

export type UpgradeReason =
  | "general"
  | "results"
  | "fresh"
  | "live"
  | "distance"
  | "alerts"
  | "notifications"
  | "saved";

export const UPGRADE_COPY: Record<UpgradeReason, { title: string; body: string }> = {
  general: {
    title: "Get the deal before everyone else",
    body: "Pro gives you instant listings, every result, live alerts and nationwide search.",
  },
  results: {
    title: "There are more deals waiting",
    body: `Free shows your top ${PLAN_LIMITS.free.maxResults} results. Pro unlocks every listing from every source.`,
  },
  fresh: {
    title: "Fresh deals are going to Pro members first",
    body: `Free users see new listings after ${PLAN_LIMITS.free.freshDelayMinutes} minutes. Good deals are usually gone by then. Pro is instant.`,
  },
  live: {
    title: "Go live",
    body: "Auto-refresh keeps your feed updating every 30 seconds so you never miss a drop. It's a Pro feature.",
  },
  distance: {
    title: "Search beyond 100 miles",
    body: "Pro unlocks search up to nationwide, great for rare parts and cars worth a road trip.",
  },
  alerts: {
    title: "Watch for more than one thing",
    body: `Free includes ${PLAN_LIMITS.free.maxAlerts} alert. Pro gives you up to ${PLAN_LIMITS.pro.maxAlerts}, so you can track every part on your list.`,
  },
  notifications: {
    title: "Get pinged the moment it's posted",
    body: "Desktop notifications for alert matches are a Pro feature.",
  },
  saved: {
    title: "Keep every listing you're watching",
    body: `Free saves up to ${PLAN_LIMITS.free.maxSaved} listings. Pro saves up to ${PLAN_LIMITS.pro.maxSaved}, so you can watch every deal on your list.`,
  },
};

export const PRO_PERKS = [
  "Instant access to new listings (no 15-minute delay)",
  "Every result, not just the top 15",
  "Live auto-refresh every 30 seconds",
  `Up to ${PLAN_LIMITS.pro.maxAlerts} keyword alerts with desktop notifications`,
  "Search nationwide, not just 100 miles",
  `Save up to ${PLAN_LIMITS.pro.maxSaved} listings to your watchlist`,
  "Email alerts as soon as a match appears (Free gets one daily digest)",
];
