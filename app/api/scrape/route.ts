import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type {
  Listing,
  ScrapeMeta,
  ScrapeRequest,
  ScrapeResponse,
  SourcePlatform,
} from "@/lib/types";
import {
  getCraigslistHtml,
  getEbayPayload,
  getMarketplacePayload,
  type EbayItem,
  type MarketplaceItem,
} from "@/lib/mockSources";
import { DEFAULT_ORIGIN, lookupMarket } from "@/lib/market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchSource<T>(produce: () => T): Promise<T> {
  await sleep(250 + Math.random() * 450);
  return produce();
}

interface ListingDraft {
  id: string;
  title: string;
  price: number;
  location: string;
  lat: number;
  lng: number;
  imageUrl: string;
  sourcePlatform: SourcePlatform;
  description: string;
  timestamp: string;
  url: string;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePrice(raw: string | number): number | null {
  const value = typeof raw === "number" ? raw : parseFloat(`${raw}`.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** Generates clean topic-focused images based on product title */
function getProductImage(title: string, platform: SourcePlatform, id: string): string {
  const t = title.toLowerCase();
  if (t.includes("coilover") || t.includes("suspension") || t.includes("spring")) {
    return "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=600&q=80";
  }
  if (t.includes("turbo") || t.includes("engine") || t.includes("exhaust") || t.includes("intake")) {
    return "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=600&q=80";
  }
  if (t.includes("wheel") || t.includes("rim") || t.includes("tire") || t.includes("enkei")) {
    return "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=600&q=80";
  }
  if (t.includes("miata") || t.includes("civic") || t.includes("brz") || t.includes("240sx") || t.includes("car")) {
    return "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80";
  }
  return `https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=600&q=80`;
}

function normalizeEbay(items: EbayItem[], query: string): ListingDraft[] {
  return items.flatMap((raw): ListingDraft[] => {
    const price = parsePrice(raw.price.value);
    if (price === null) return [];
    const title = cleanText(raw.title);
    const searchTerm = query || title;
    return [
      {
        id: `ebay-${raw.itemId}`,
        title,
        price,
        location: `${raw.itemLocation.city}, ${raw.itemLocation.stateOrProvince}`,
        lat: raw.itemLocation.latitude,
        lng: raw.itemLocation.longitude,
        imageUrl: raw.image?.imageUrl || getProductImage(title, "eBay", raw.itemId),
        sourcePlatform: "eBay",
        description: cleanText(raw.shortDescription),
        timestamp: new Date(raw.itemCreationDate).toISOString(),
        url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchTerm)}`,
      },
    ];
  });
}

function normalizeMarketplace(items: MarketplaceItem[], query: string): ListingDraft[] {
  return items.flatMap((raw): ListingDraft[] => {
    const price = parsePrice(raw.listing_price.amount);
    if (price === null) return [];
    const title = cleanText(raw.marketplace_listing_title);
    const searchTerm = query || title;
    return [
      {
        id: `mkt-${raw.id}`,
        title,
        price,
        location: `${raw.location.city}, ${raw.location.state}`,
        lat: raw.location.latitude,
        lng: raw.location.longitude,
        imageUrl: raw.primary_photo_uri || getProductImage(title, "Marketplace", raw.id),
        sourcePlatform: "Marketplace",
        description: cleanText(raw.redacted_description.text),
        timestamp: new Date(raw.creation_time * 1000).toISOString(),
        url: `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(searchTerm)}`,
      },
    ];
  });
}

function parseCraigslist(html: string, query: string): ListingDraft[] {
  const $ = cheerio.load(html);
  const drafts: ListingDraft[] = [];

  $("li.result-row").each((_, element) => {
    const row = $(element);
    const pid = row.attr("data-pid");
    const lat = parseFloat(row.attr("data-lat") ?? "");
    const lng = parseFloat(row.attr("data-lon") ?? "");
    const price = parsePrice(row.find(".result-price").first().text());
    const title = cleanText(row.find("a.result-title").first().text());
    const posted = new Date(row.find("time.result-date").attr("datetime") ?? "");

    if (!pid || !title || price === null) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Number.isNaN(posted.getTime())) return;

    const hood = cleanText(row.find(".result-hood").text()).replace(/^\(|\)$/g, "");
    const searchTerm = query || title;

    drafts.push({
      id: `cl-${pid}`,
      title,
      price,
      location: `${hood || "Atlanta"}, GA`,
      lat,
      lng,
      imageUrl: getProductImage(title, "Craigs", pid),
      sourcePlatform: "Craigs",
      description: cleanText(row.find(".result-desc").text()),
      timestamp: posted.toISOString(),
      url: `https://atlanta.craigslist.org/search/sss?query=${encodeURIComponent(searchTerm)}`,
    });
  });

  return drafts;
}

const EARTH_RADIUS_MILES = 3958.7613;

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDealScore(price: number, median: number | null): number {
  if (median === null || median <= 0) return 5;
  const ratio = price / median;
  const raw = 10 - (ratio - 0.5) * 10;
  return Math.min(10, Math.max(1, Math.round(raw)));
}

interface ScamRule {
  reason: string;
  weight: number;
  pattern: RegExp;
}

const SCAM_TEXT_RULES: ScamRule[] = [
  {
    reason: "Requests untraceable payment (wire transfer, gift cards, crypto, or similar)",
    weight: 3,
    pattern:
      /wire transfer|wiring (the )?(money|funds)|western union|moneygram|gift ?cards?|bitcoin|crypto(currency)?|zelle only|cash ?app only|venmo friends/,
  },
  {
    reason: "No title or title problems (lost, missing, pending, or bill of sale only)",
    weight: 2,
    pattern:
      /\bno title\b|\bmissing title\b|\blost (the |my )?title\b|bill of sale only|only (have|got) (a )?bill of sale|title (is )?(in the mail|pending|lost)|needs? (a )?title/,
  },
  {
    reason: "Seller is unreachable and routes the sale through an overseas shipping agent",
    weight: 2,
    pattern:
      /deployed|overseas|out of (the )?country|shipping agent|agent will (pick|deliver|ship)|shipping company will/,
  },
  {
    reason: "Demands a deposit before the buyer can inspect the item",
    weight: 2,
    pattern: /(send|pay|put down)( me)?( a)?( holding| refundable)? deposit|deposit to hold/,
  },
  {
    reason: "Pushes the conversation off-platform (personal email address)",
    weight: 1,
    pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/,
  },
  {
    reason: "High-pressure urgency language",
    weight: 1,
    pattern: /must sell (today|asap|now|fast)|first (one )?to (send|pay)|act fast/,
  },
];

const SCAM_THRESHOLD = 3;
const SUSPICIOUS_PRICE_RATIO = 0.45;
const DUPLICATE_SIMILARITY = 0.85;
const SCAM_SCORE_CAP = 2;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function findDuplicateIds(drafts: ListingDraft[]): Set<string> {
  const tokens = drafts.map((draft) => tokenize(draft.description));
  const duplicates = new Set<string>();

  for (let i = 0; i < drafts.length; i++) {
    if (tokens[i].size < 8) continue;
    for (let j = i + 1; j < drafts.length; j++) {
      if (tokens[j].size < 8) continue;
      if (jaccard(tokens[i], tokens[j]) >= DUPLICATE_SIMILARITY) {
        duplicates.add(drafts[i].id);
        duplicates.add(drafts[j].id);
      }
    }
  }
  return duplicates;
}

interface ScamVerdict {
  isScam: boolean;
  reasoning: string | null;
}

function scanForScam(
  draft: ListingDraft,
  median: number | null,
  duplicateIds: Set<string>,
): ScamVerdict {
  const text = `${draft.title} ${draft.description}`.toLowerCase();
  const reasons: string[] = [];
  let weight = 0;

  for (const rule of SCAM_TEXT_RULES) {
    if (rule.pattern.test(text)) {
      reasons.push(rule.reason);
      weight += rule.weight;
    }
  }

  if (duplicateIds.has(draft.id)) {
    reasons.push("Description is a copy-paste duplicate of another listing");
    weight += 2;
  }

  if (median !== null && draft.price / median < SUSPICIOUS_PRICE_RATIO) {
    const percent = Math.round((draft.price / median) * 100);
    reasons.push(`Suspiciously low price: only ${percent}% of the typical market price`);
    weight += 3;
  }

  const isScam = weight >= SCAM_THRESHOLD;
  return { isScam, reasoning: isScam ? reasons.join(". ") + "." : null };
}

const ANY_DISTANCE = 1500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRequest(input: Record<string, unknown>): Required<ScrapeRequest> {
  return {
    query: typeof input.query === "string" ? input.query.trim().slice(0, 120) : "",
    maxDistance: clamp(toNumber(input.maxDistance, ANY_DISTANCE), 1, ANY_DISTANCE),
    minDealScore: clamp(Math.round(toNumber(input.minDealScore, 1)), 1, 10),
    originLat: clamp(toNumber(input.originLat, DEFAULT_ORIGIN.lat), -90, 90),
    originLng: clamp(toNumber(input.originLng, DEFAULT_ORIGIN.lng), -180, 180),
  };
}

async function runScrape(request: Required<ScrapeRequest>): Promise<ScrapeResponse> {
  const startedAt = Date.now();
  const now = startedAt;

  const [ebayRaw, marketplaceRaw, craigsHtml] = await Promise.all([
    fetchSource(() => getEbayPayload(now)),
    fetchSource(() => getMarketplacePayload(now)),
    fetchSource(() => getCraigslistHtml(now)),
  ]);

  const seen = new Set<string>();
  const drafts = [
    ...normalizeEbay(ebayRaw, request.query),
    ...normalizeMarketplace(marketplaceRaw, request.query),
    ...parseCraigslist(craigsHtml, request.query),
  ].filter((draft) => (seen.has(draft.id) ? false : (seen.add(draft.id), true)));

  const sources: Record<SourcePlatform, number> = { eBay: 0, Marketplace: 0, Craigs: 0 };
  for (const draft of drafts) sources[draft.sourcePlatform]++;

  const duplicateIds = findDuplicateIds(drafts);

  const terms = request.query.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = drafts.filter((draft) => {
    if (terms.length === 0) return true;
    const haystack = `${draft.title} ${draft.description}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });

  const enriched: Listing[] = matched.map((draft) => {
    const market = lookupMarket(draft.title);
    const median = market?.median ?? null;
    const verdict = scanForScam(draft, median, duplicateIds);
    const baseScore = computeDealScore(draft.price, median);

    return {
      id: draft.id,
      title: draft.title,
      price: draft.price,
      location: draft.location,
      distanceMiles:
        Math.round(
          haversineMiles(request.originLat, request.originLng, draft.lat, draft.lng) * 10,
        ) / 10,
      imageUrl: draft.imageUrl,
      sourcePlatform: draft.sourcePlatform,
      description: draft.description,
      dealScore: verdict.isScam ? Math.min(baseScore, SCAM_SCORE_CAP) : baseScore,
      isScam: verdict.isScam,
      scamReasoning: verdict.reasoning,
      timestamp: draft.timestamp,
      marketMedian: median,
      url: draft.url,
    } as Listing;
  });

  const listings = enriched
    .filter(
      (listing) =>
        (request.maxDistance >= ANY_DISTANCE || listing.distanceMiles <= request.maxDistance) &&
        listing.dealScore >= request.minDealScore,
    )
    .sort(
      (a, b) =>
        b.dealScore - a.dealScore ||
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  const meta: ScrapeMeta = {
    totalScraped: drafts.length,
    returned: listings.length,
    scamCount: listings.filter((listing) => listing.isScam).length,
    durationMs: Date.now() - startedAt,
    scrapedAt: new Date().toISOString(),
    origin: {
      label:
        request.originLat === DEFAULT_ORIGIN.lat && request.originLng === DEFAULT_ORIGIN.lng
          ? DEFAULT_ORIGIN.label
          : `${request.originLat.toFixed(2)}, ${request.originLng.toFixed(2)}`,
      lat: request.originLat,
      lng: request.originLng,
    },
    sources,
  };

  return { listings, meta };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = await runScrape(parseRequest(body as Record<string, unknown>));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const result = await runScrape(parseRequest(params));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}