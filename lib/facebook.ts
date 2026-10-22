import https from "node:https";
import zlib from "node:zlib";
import * as cheerio from "cheerio";
import { placeholderImage } from "./placeholder";
import { MIN_REAL_PRICE, titleMatchesQuery, type ListingDraft, type Origin } from "./scrapers";

/**
 * Facebook Marketplace scraper for the PUBLIC (logged-out) search pages.
 *
 * How it works: Facebook server-renders the first page of results as JSON inside
 * <script type="application/json"> tags. We fetch the page like a browser navigation, pull
 * those tags out, and walk the JSON for listing objects. No login, cookies or private APIs.
 *
 * Limits (inherent to the logged-out page):
 *  - Only the first ~15-25 results are returned; there is no pagination.
 *  - The city comes from the URL slug ("la", "nyc", ...). Facebook silently ignores unknown
 *    slugs and uses the requesting IP's location instead, so only verified slugs are listed.
 *  - Listings carry city/state but no coordinates or description, so distance is unknown.
 *  - Facebook may block datacenter IPs (e.g. Vercel). Callers should handle thrown errors.
 */

// Verified against facebook.com/marketplace/<slug>/search: each returned local listings.
const MARKETPLACE_CITIES = [
  { slug: "la", lat: 34.0522, lng: -118.2437 },
  { slug: "sanfrancisco", lat: 37.7749, lng: -122.4194 },
  { slug: "sandiego", lat: 32.7157, lng: -117.1611 },
  { slug: "sac", lat: 38.5816, lng: -121.4944 },
  { slug: "seattle", lat: 47.6062, lng: -122.3321 },
  { slug: "portland", lat: 45.5152, lng: -122.6784 },
  { slug: "phoenix", lat: 33.4484, lng: -112.074 },
  { slug: "vegas", lat: 36.1699, lng: -115.1398 },
  { slug: "denver", lat: 39.7392, lng: -104.9903 },
  { slug: "saltlakecity", lat: 40.7608, lng: -111.891 },
  { slug: "dallas", lat: 32.7767, lng: -96.797 },
  { slug: "houston", lat: 29.7604, lng: -95.3698 },
  { slug: "austin", lat: 30.2672, lng: -97.7431 },
  { slug: "minneapolis", lat: 44.9778, lng: -93.265 },
  { slug: "chicago", lat: 41.8781, lng: -87.6298 },
  { slug: "detroit", lat: 42.3314, lng: -83.0458 },
  { slug: "atlanta", lat: 33.749, lng: -84.388 },
  { slug: "charlotte", lat: 35.2271, lng: -80.8431 },
  { slug: "miami", lat: 25.7617, lng: -80.1918 },
  { slug: "orlando", lat: 28.5383, lng: -81.3792 },
  { slug: "dc", lat: 38.9072, lng: -77.0369 },
  { slug: "philly", lat: 39.9526, lng: -75.1652 },
  { slug: "nyc", lat: 40.7128, lng: -74.006 },
  { slug: "boston", lat: 42.3601, lng: -71.0589 },
];

function nearestCity(origin: Origin) {
  const dist = (c: Origin) => (c.lat - origin.lat) ** 2 + (c.lng - origin.lng) ** 2;
  return MARKETPLACE_CITIES.reduce((best, city) => (dist(city) < dist(best) ? city : best));
}

const MAX_RESULTS = 24;
const MAX_REDIRECTS = 5;

// Facebook rejects requests lacking browser navigation headers (Sec-Fetch-*) with a bare
// HTTP 400. Node's built-in fetch forces Sec-Fetch-Mode: cors, so we use node:https.
const NAV_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function requestOnce(
  url: string,
  cookies: Map<string, string>,
  timeoutMs: number,
): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const cookieHeader = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    const request = https.get(
      url,
      { headers: { ...NAV_HEADERS, ...(cookieHeader ? { Cookie: cookieHeader } : {}) } },
      (response) => {
        for (const raw of response.headers["set-cookie"] ?? []) {
          const [pair] = raw.split(";");
          const eq = pair.indexOf("=");
          if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          let buffer = Buffer.concat(chunks);
          try {
            const encoding = response.headers["content-encoding"];
            if (encoding === "gzip") buffer = zlib.gunzipSync(buffer);
            else if (encoding === "br") buffer = zlib.brotliDecompressSync(buffer);
            else if (encoding === "deflate") buffer = zlib.inflateSync(buffer);
          } catch (error) {
            reject(error);
            return;
          }
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location,
            body: buffer.toString("utf8"),
          });
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Facebook request timed out")));
    request.on("error", reject);
  });
}

async function fetchPage(startUrl: string, timeoutMs = 9000): Promise<string> {
  const cookies = new Map<string, string>();
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { status, location, body } = await requestOnce(url, cookies, timeoutMs);
    if (status >= 300 && status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    if (status !== 200) throw new Error(`Facebook Marketplace returned HTTP ${status}`);
    return body;
  }
  throw new Error("Facebook Marketplace redirected too many times");
}

interface FbListing {
  id?: string;
  marketplace_listing_title?: string;
  custom_title?: string | null;
  listing_price?: { amount?: string } | null;
  primary_listing_photo?: { image?: { uri?: string } } | null;
  location?: { reverse_geocode?: { city?: string; state?: string } } | null;
  creation_time?: number;
  custom_sub_titles_with_rendering_flags?: { subtitle?: string }[] | null;
  is_sold?: boolean;
  is_pending?: boolean;
}

/** Recursively collects every object that looks like a Marketplace listing. */
function collectListings(node: unknown, found: Map<string, FbListing>, depth = 0): void {
  if (depth > 60 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectListings(child, found, depth + 1);
    return;
  }
  const record = node as Record<string, unknown> & FbListing;
  if (
    typeof record.id === "string" &&
    typeof record.marketplace_listing_title === "string" &&
    record.listing_price
  ) {
    if (!found.has(record.id)) found.set(record.id, record);
    return;
  }
  for (const value of Object.values(record)) collectListings(value, found, depth + 1);
}

export async function scrapeFacebookMarketplace(
  query: string,
  origin: Origin,
): Promise<ListingDraft[]> {
  const city = nearestCity(origin);
  const url = query
    ? `https://www.facebook.com/marketplace/${city.slug}/search/?query=${encodeURIComponent(query)}`
    : `https://www.facebook.com/marketplace/${city.slug}/`;

  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const found = new Map<string, FbListing>();
  $('script[type="application/json"]').each((_, element) => {
    const text = $(element).contents().text();
    if (!text.includes("marketplace_listing_title")) return;
    try {
      collectListings(JSON.parse(text), found);
    } catch {
      // Not valid standalone JSON; skip this tag.
    }
  });

  if (found.size === 0) {
    throw new Error("No Marketplace listings found in page (blocked or layout changed)");
  }

  const drafts: ListingDraft[] = [];
  for (const listing of found.values()) {
    if (drafts.length >= MAX_RESULTS) break;
    if (listing.is_sold || listing.is_pending) continue;

    const id = listing.id as string;
    const title = (listing.custom_title || listing.marketplace_listing_title || "").trim();
    const price = parseFloat(listing.listing_price?.amount ?? "");
    if (!title || !Number.isFinite(price) || price < MIN_REAL_PRICE) continue;
    if (query && !titleMatchesQuery(title, query)) continue;

    const geo = listing.location?.reverse_geocode;
    const subtitles = (listing.custom_sub_titles_with_rendering_flags ?? [])
      .map((entry) => entry.subtitle)
      .filter(Boolean)
      .join(" · ");

    drafts.push({
      id: `fb-${id}`,
      title,
      price: Math.round(price),
      location: geo?.city ? `${geo.city}${geo.state ? `, ${geo.state}` : ""}` : "Facebook Marketplace",
      lat: null,
      lng: null,
      imageUrl: listing.primary_listing_photo?.image?.uri || placeholderImage(title, id),
      sourcePlatform: "Marketplace",
      description: subtitles,
      timestamp: listing.creation_time
        ? new Date(listing.creation_time * 1000).toISOString()
        : new Date().toISOString(),
      url: `https://www.facebook.com/marketplace/item/${id}/`,
    });
  }

  return drafts;
}
