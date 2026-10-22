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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  url: string;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePrice(raw: string | number): number | null {
  const value = typeof raw === "number" ? raw : parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** Scrapes real cover photos directly from Craigslist RSS feed */
async function fetchCraigslistLive(query: string, originLat: number, originLng: number): Promise<ScrapedListingDraft[]> {
  const drafts: ScrapedListingDraft[] = [];
  try {
    const rssUrl = `https://atlanta.craigslist.org/search/sss?query=${encodeURIComponent(query)}&format=rss`;
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) return drafts;
    const xmlText = await res.text();
    const $ = cheerio.load(xmlText, { xmlMode: true });

    $("item").each((i, element) => {
      if (i >= 15) return;
      const item = $(element);
      const titleRaw = item.find("title").text();
      const itemUrl = item.find("link").text() || `https://atlanta.craigslist.org/search/sss?query=${encodeURIComponent(query)}`;
      
      // Parse Title and Price from RSS format: "Title - $500 (Atlanta)"
      let title = titleRaw;
      let price: number | null = null;

      const priceMatch = titleRaw.match(/\&#x24;([0-9,]+)|\$([0-9,]+)/);
      if (priceMatch) {
        price = parsePrice(priceMatch[1] || priceMatch[2]);
        title = titleRaw.replace(/\&#x24;[0-9,]+|\$[0-9,]+/, "").replace(/\([^)]*\)/, "").trim();
      }

      // Extract real listing cover photo directly from RSS enclosure tag
      let realImg = item.find("enc\\:enclosure").attr("resource") || 
                    item.find("enclosure").attr("url") || "";

      // Fallback: extract image URL from the description HTML in RSS
      if (!realImg) {
        const descHtml = item.find("description").text();
        const imgMatch = descHtml.match(/src="(https:\/\/images\.craigslist\.org\/[^"]+)"/);
        if (imgMatch) {
          realImg = imgMatch[1];
        }
      }

      if (title && price !== null) {
        drafts.push({
          id: `cl-${i}-${Date.now()}`,
          title: cleanText(title),
          price,
          location: "Atlanta / Local",
          lat: originLat + (Math.random() - 0.5) * 0.08,
          lng: originLng + (Math.random() - 0.5) * 0.08,
          imageUrl: realImg || `https://images.craigslist.org/00606_hV3x2QdG4Xf_0CI0t2_600x450.jpg`,
          sourcePlatform: "Craigs",
          description: `Live Craigslist listing: ${cleanText(title)}.`,
          timestamp: new Date().toISOString(),
          url: itemUrl,
        });
      }
    });
  } catch (err) {
    console.error("Craigslist live RSS fetch error:", err);
  }
  return drafts;
}

/** eBay Scraper */
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
      if (i >= 15) return;
      const row = $(element);
      const title = cleanText(row.find(".s-item__title").text());
      const price = parsePrice(row.find(".s-item__price").text());
      const itemUrl = row.find("a.s-item__link").attr("href") || `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
      const imgUrl = row.find(".s-item__image-img").attr("src") || row.find(".s-item__image-img").attr("data-src") || "";

      if (title && !title.includes("Shop on eBay") && price !== null) {
        drafts.push({
          id: `ebay-${i}-${Date.now()}`,
          title,
          price,
          location: "Shipped / Online",
          lat: originLat + (Math.random() - 0.5) * 0.15,
          lng: originLng + (Math.random() - 0.5) * 0.15,
          imageUrl: imgUrl || `https://placehold.co/600x400/18181b/ffffff?text=${encodeURIComponent(title.slice(0, 20))}`,
          sourcePlatform: "eBay",
          description: `Live eBay item listing for ${title}.`,
          timestamp: new Date().toISOString(),
          url: itemUrl,
        });
      }
    });
  } catch (err) {
    console.error("eBay live fetch error:", err);
  }
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRequest(input: Record<string, unknown>): Required<ScrapeRequest> {
  return {
    query: typeof input.query === "string" && input.query.trim() !== "" ? input.query.trim().slice(0, 120) : "tires",
    maxDistance: clamp(toNumber(input.maxDistance, 1500), 1, 1500),
    minDealScore: clamp(Math.round(toNumber(input.minDealScore, 1)), 1, 10),
    originLat: clamp(toNumber(input.originLat, DEFAULT_ORIGIN.lat), -90, 90),
    originLng: clamp(toNumber(input.originLng, DEFAULT_ORIGIN.lng), -180, 180),
  };
}

async function runScrape(request: Required<ScrapeRequest>): Promise<ScrapeResponse> {
  const startedAt = Date.now();

  const [craigsDrafts, ebayDrafts] = await Promise.all([
    fetchCraigslistLive(request.query, request.originLat, request.originLng),
    fetchEbayLive(request.query, request.originLat, request.originLng),
  ]);

  const drafts = [...craigsDrafts, ...ebayDrafts];

  const sources: Record<SourcePlatform, number> = {
    eBay: ebayDrafts.length,
    Marketplace: 0,
    Craigs: craigsDrafts.length,
  };

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
      url: draft.url,
    } as Listing;
  });

  const listings = enriched
    .filter(
      (listing) =>
        (request.maxDistance >= 1500 || listing.distanceMiles <= request.maxDistance) &&
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