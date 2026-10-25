import { getUser, saveUser, USERS_SET, type User } from "./auth";
import { matchesAlert } from "./alerts";
import { accountOwner, listAlerts } from "./db";
import { SITE_URL } from "./email";
import { kvGet, kvSet, kvSMembers } from "./kv";
import { alertEmail, sendMail, type AlertMatches } from "./mail";
import { DEFAULT_ORIGIN } from "./market";
import { PLAN_LIMITS, type Plan } from "./plan";
import { isProEmail } from "./pro";
import type { AlertKeyword, Listing, ScrapeResponse } from "./types";
import { ALL_SOURCES } from "./types";

/**
 * Sends "new match" emails. Each run looks at every user with email alerts on, searches each of
 * their alerts, and emails the listings they haven't been told about yet. Free accounts get at
 * most one email a day; Pro accounts are emailed as soon as the next run finds something.
 */

const SHOWN_PER_ALERT = 4;
const MAX_SEEN = 600;
const SEEN_TTL_SECONDS = 45 * 24 * 3600;
const DEADLINE_MS = 50_000;

const seenKey = (email: string) => `dealradar:alertseen:${email}`;

export interface AlertRunSummary {
  users: number;
  checked: number;
  emailed: number;
  skipped: number;
  timedOut: boolean;
}

async function search(
  alert: AlertKeyword,
  user: User,
  plan: Plan,
  cache: Map<string, Promise<Listing[]>>,
): Promise<Listing[]> {
  const origin = user.location ?? { ...DEFAULT_ORIGIN };
  // Same search, plan and area across users is fetched once per run (saves scraper/proxy usage).
  const key = [alert.keyword.toLowerCase(), plan, origin.lat.toFixed(1), origin.lng.toFixed(1)].join("|");
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${SITE_URL}/api/scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.CRON_SECRET ?? "",
          "x-internal-plan": plan,
        },
        body: JSON.stringify({
          query: alert.keyword,
          sources: ALL_SOURCES,
          sort: "newest",
          originLat: origin.lat,
          originLng: origin.lng,
        }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!response.ok) throw new Error(`scrape returned ${response.status}`);
      return ((await response.json()) as ScrapeResponse).listings;
    })();
    cache.set(key, pending);
  }
  return pending;
}

async function processUser(
  user: User,
  now: number,
  cache: Map<string, Promise<Listing[]>>,
): Promise<"emailed" | "checked" | "skipped"> {
  const alerts = (await listAlerts(accountOwner(user.email))).filter((alert) => alert.enabled);
  if (alerts.length === 0) return "skipped";

  const plan: Plan = (await isProEmail(user.email)) ? "pro" : "free";
  const cooldownMs = PLAN_LIMITS[plan].emailAlertCooldownMinutes * 60_000;
  if (user.lastAlertEmailAt && now - new Date(user.lastAlertEmailAt).getTime() < cooldownMs) {
    return "skipped";
  }

  const seen = new Set((await kvGet<string[]>(seenKey(user.email))) ?? []);
  const groups: AlertMatches[] = [];
  const newlySeen: string[] = [];

  for (const alert of alerts) {
    let listings: Listing[];
    try {
      listings = await search(alert, user, plan, cache);
    } catch (error) {
      console.error(`[alerts] search for "${alert.keyword}" failed:`, error);
      continue;
    }
    const fresh = listings.filter((listing) => matchesAlert(listing, alert) && !seen.has(listing.id));
    if (fresh.length === 0) continue;
    // Several alerts can match one listing; only tell the user about it once.
    const unique = fresh.filter((listing) => !newlySeen.includes(listing.id));
    unique.forEach((listing) => newlySeen.push(listing.id));
    if (unique.length === 0) continue;
    const ranked = [...unique].sort((a, b) => b.dealScore - a.dealScore);
    groups.push({
      keyword: alert.keyword,
      listings: ranked.slice(0, SHOWN_PER_ALERT),
      more: Math.max(0, ranked.length - SHOWN_PER_ALERT),
    });
  }

  const fresh = await getUser(user.email); // pick up any preference change made during the run
  if (!fresh || !fresh.emailAlerts) return "skipped";

  if (groups.length === 0) {
    await saveUser({ ...fresh, lastCheckedAt: new Date(now).toISOString() });
    return "checked";
  }

  const sent = await sendMail({ to: user.email, ...alertEmail(fresh, groups) });
  if (!sent) return "checked"; // try again next run; nothing marked as seen

  await kvSet(seenKey(user.email), [...newlySeen, ...seen].slice(0, MAX_SEEN), { exSeconds: SEEN_TTL_SECONDS });
  const stamp = new Date(now).toISOString();
  await saveUser({ ...fresh, lastCheckedAt: stamp, lastAlertEmailAt: stamp });
  return "emailed";
}

export async function runAlertEmails(): Promise<AlertRunSummary> {
  const startedAt = Date.now();
  const summary: AlertRunSummary = { users: 0, checked: 0, emailed: 0, skipped: 0, timedOut: false };

  const users: User[] = [];
  for (const email of await kvSMembers(USERS_SET)) {
    const user = await getUser(email);
    if (user?.emailAlerts) users.push(user);
  }
  summary.users = users.length;

  // Least recently checked first, so a run that times out still treats everyone fairly over time.
  users.sort((a, b) => (a.lastCheckedAt ?? "").localeCompare(b.lastCheckedAt ?? ""));

  const cache = new Map<string, Promise<Listing[]>>();
  for (const user of users) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      summary.timedOut = true;
      break;
    }
    try {
      const result = await processUser(user, startedAt, cache);
      if (result === "skipped") summary.skipped += 1;
      else {
        summary.checked += 1;
        if (result === "emailed") summary.emailed += 1;
      }
    } catch (error) {
      console.error(`[alerts] user failed:`, error);
    }
  }
  return summary;
}
