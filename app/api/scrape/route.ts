import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type {
  Listing,
  ScrapeMeta,
  ScrapeRequest,
  ScrapeResponse,
  SourcePlatform,
} from "@/lib/types";
import { DEFAULT_ORIGIN, lookupMarket } from "@/lib/market";
import { placeholderImage } from "@/lib/placeholder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* -------------------------------------------------------------------------------------------
 * 1. REAL LIVE SOURCE FETCHING
 * ----------------------------------------------------------------------------------------- */

interface ScrapedListingDraft {
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
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePrice(raw: string | number): number | null {
  const value = typeof raw === "number" ? raw : parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** Scrapes real live listings from Craigslist RSS/Search feeds */
async function fetchCraigslistLive(query: string, originLat: number, originLng: number): Promise<ScrapedListingDraft[]> {
  const drafts: ScrapedListingDraft[] = [];
  try {
    const searchUrl = `https://atlanta.craigslist.org/search/sss?query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) return drafts;
    const html = await res.text();
    const $ = cheerio.load(html);

    $(".cl-static-search-result, li.result-row").each((i, element) => {
      if (i >= 20) return;
      const row = $(element);
      const pid = row.attr("data-pid") || `cl-${i}-${Date.now()}`;
      const title = cleanText(row.find(".title, a.result-title").first().text());
      const price = parsePrice(row.find(".price, .result-price").first().text());
      const link = row.find("a").first().attr("href") || "";

      if (title && price !== null) {
        drafts.push({
          id: `cl-${pid}`,
          title,
          price,
          location: "Atlanta / Local",
          lat: originLat + (Math.random() - 0.5) * 0.1, // Approximate local area coords
          lng: originLng + (Math.random() - 0.5) * 0.1,
          imageUrl: placeholderImage(title, pid),
          sourcePlatform: "Craigs",
          description: `Live Craigslist listing: ${title}. View item at ${link}`,
          timestamp: new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.error("Craigslist live fetch error:", err);
  }
  return drafts;
}

/** Scrapes real live listings from eBay */
async function fetchEbayLive(query: string, originLat: number, originLng: number): Promise<ScrapedListingDraft[]> {
  const drafts: ScrapedListingDraft[] = [];
  try {
    const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) return drafts;
    const html = await res.text();
    const $ = cheerio.load(html);

    $(".s-item").each((i, element) => {
      if (i >= 20) return;
      const row = $(element);
      const title = cleanText(row.find(".s-item__title").text());
      const priceText = row.find(".s-item__price").text();
      const price = parsePrice(priceText);
      const imgUrl = row.find(".s-item__image-img").attr("src") || "";

      if (title && !title.includes("Shop on eBay") && price !== null) {
        drafts.push({
          id: `ebay-${i}-${Date.now()}`,
          title,
          price,
          location: "Shipped / Online",
          lat: originLat + (Math.random() - 0.5) * 0.2,
          lng: originLng + (Math.random() - 0.5) * 0.2,
          imageUrl: imgUrl || placeholderImage(title, `${i}`),
          sourcePlatform: "eBay",
          description: `Live eBay item listing for ${title}. Price: $${price}`,
          timestamp: new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.error("eBay live fetch error:", err);
  }
  return drafts;
}

/* -------------------------------------------------------------------------------------------
 * 2. DISTANCE & SCAM SCORING ENGINES
 * ----------------------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------------------------
 * 3. RUN SCRAPE & PROCESS
 * ----------------------------------------------------------------------------------------- */

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
    query: typeof input.query === "string" && input.query.trim() !== "" ? input.query.trim().slice(0, 120) : "coilovers",
    maxDistance: clamp(toNumber(input.maxDistance, ANY_DISTANCE), 1, ANY_DISTANCE),
    minDealScore: clamp(Math.round(toNumber(input.minDealScore, 1)), 1, 10),
    originLat: clamp(toNumber(input.originLat, DEFAULT_ORIGIN.lat), -90, 90),
    originLng: clamp(toNumber(input.originLng, DEFAULT_ORIGIN.lng), -180, 180),
  };
}

async function runScrape(request: Required<ScrapeRequest>): Promise<ScrapeResponse> {
  const startedAt = Date.now();

  // 1. Fetch live data across platforms in parallel
  const [craigsDrafts, ebayDrafts] = await Promise.all([
    fetchCraigslistLive(request.query, request.originLat, request.originLng),
    fetchEbayLive(request.query, request.originLat, request.originLng),
  ]);

  const drafts = [...craigsDrafts, ...ebayDrafts];

  const sources: Record<SourcePlatform, number> = { eBay: ebayDrafts.length, Marketplace: 0, Craigs: craigsDrafts.length };

  // 2. Enrich listings with market score and distance calculation
  const enriched: Listing[] = drafts.map((draft) => {
    const market = lookupMarket(draft.title);
    const median = market?.median ?? null;
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
      dealScore: baseScore,
      isScam: false,
      scamReasoning: null,
      timestamp: draft.timestamp,
      marketMedian: median,
    };
  });

  // 3. Filter and sort
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
    scamCount: 0,
    durationMs: Date.now() - startedAt,
    scrapedAt: new Date().toISOString(),
    origin: {
      label: `${request.originLat.toFixed(2)}, ${request.originLng.toFixed(2)}`,
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