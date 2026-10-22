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
  return value.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function parsePrice(raw: string | number): number | null {
  const value = typeof raw === "number" ? raw : parseFloat(`${raw}`.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** 1. CRAIGSLIST SCRAPER (RSS Feed with decoded cover photos) */
async function fetchCraigslist(query: string, originLat: number, originLng: number): Promise<ScrapedListingDraft[]> {
  const drafts: ScrapedListingDraft[] = [];
  try {
    const rssUrl = `https://atlanta.craigslist.org/search/sss?query=${encodeURIComponent(query)}&format=rss`;
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 0 },
    });

    if (res.ok) {
      const xmlText = await res.text();
      const $ = cheerio.load(xmlText, { xmlMode: true });

      $("item").each((i, element) => {
        if (i >= 15) return;
        const item = $(element);
        const titleRaw = item.find("title").text();
        const itemUrl = item.find("link").text() || `https://atlanta.craigslist.org/search/sss?query=${encodeURIComponent(query)}`;
        
        let title = cleanText(titleRaw);
        let price: number | null = null;

        const priceMatch = titleRaw.match(/\&#x24;([0-9,]+)|\$([0-9,]+)/);
        if (priceMatch) {
          price = parsePrice(priceMatch[1] || priceMatch[2]);
          title = titleRaw.replace(/\&#x24;[0-9,]+|\$[0-9,]+/, "").replace(/\([^)]*\)/, "").trim();
        }

        let realImg = item.find("enc\\:enclosure").attr("resource") || item.find("enclosure").attr("url") || "";
        if (!realImg) {
          const descHtml = item.find("description").text();
          const imgMatch = descHtml.match(/src="(https:\/\/images\.craigslist\.org\/[^"]+)"/);
          if (imgMatch) realImg = imgMatch[1];
        }

        if (title && (price || price === 0)) {
          drafts.push({
            id: `cl-${i}-${Date.now()}`,
            title: cleanText(title),
            price: price || 500,
            location: "Atlanta / Local",
            lat: originLat + (Math.random() - 0.5) * 0.05,
            lng: originLng + (Math.random() - 0.5) * 0.05,
            imageUrl: realImg || "https://images.craigslist.org/00606_hV3x2QdG4Xf_0CI0t2_600x450.jpg",
            sourcePlatform: "Craigs",
            description: `Live Craigslist listing: ${cleanText(title)}.`,
            timestamp: new Date().toISOString(),
            url: itemUrl,
          });
        }
      });
    }
  } catch (err) {
    console.error("Craigslist fetch error:", err);
  }
  return drafts;
}

/** 2. EBAY RSS/HTML SCRAPER */
async function fetchEbay(query: string, originLat: number, originLng: number): Promise<ScrapedListingDraft[]> {
  const drafts: ScrapedListingDraft[] = [];
  try {
    const rssUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_rss=1`;
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 0 },
    });

    if (res.ok) {
      const xmlText = await res.text();
      const $ = cheerio.load(xmlText, { xmlMode: true });

      $("item").each((i, element) => {
        if (i >= 15) return;
        const item = $(element);
        const title = cleanText(item.find("title").text());
        const itemUrl = item.find("link").text() || `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
        const desc = item.find("description").text();

        const priceMatch = desc.match(/\$([0-9,]+(\.[0-9]{2})?)/);
        const price = priceMatch ? parsePrice(priceMatch[1]) : 250;

        const imgMatch = desc.match(/src="([^"]+)"/);
        const imageUrl = imgMatch ? imgMatch[1] : "";

        if (title && !title.includes("Shop on eBay")) {
          drafts.push({
            id: `ebay-${i}-${Date.now()}`,
            title,
            price: price || 200,
            location: "Shipped / Online",
            lat: originLat + (Math.random() - 0.5) * 0.1,
            lng: originLng + (Math.random() - 0.5) * 0.1,
            imageUrl,
            sourcePlatform: "eBay",
            description: `Live eBay item listing for ${title}.`,
            timestamp: new Date().toISOString(),
            url: itemUrl,
          });
        }
      });
    }
  } catch (err) {
    console.error("eBay fetch error:", err);
  }
  return drafts;
}

/** 3. FACEBOOK MARKETPLACE SCRAPER */
async function fetchMarketplace(query: string, originLat: number, originLng: number): Promise<ScrapedListingDraft[]> {
  const drafts: ScrapedListingDraft[] = [];
  try {
    const fbUrl = `https://www.facebook.com/marketplace/atlanta/search/?query=${encodeURIComponent(query)}`;
    const res = await fetch(fbUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 0 },
    });

    if (res.ok) {
      const html = await res.text();
      const matches = html.match(/{"id":"\d+","marketplace_listing_title":"[^"]+"[^}]*}/g);
      if (matches) {
        matches.slice(0, 10).forEach((rawMatch, index) => {
          try {
            const parsed = JSON.parse(rawMatch);
            if (parsed.id && parsed.marketplace_listing_title) {
              drafts.push({
                id: `mkt-${parsed.id}`,
                title: cleanText(parsed.marketplace_listing_title),
                price: parsePrice(parsed.listing_price?.amount) || 300,
                location: "Atlanta / Local",
                lat: originLat + (Math.random() - 0.5) * 0.04,
                lng: originLng + (Math.random() - 0.5) * 0.04,
                imageUrl: parsed.primary_photo?.image?.uri || "",
                sourcePlatform: "Marketplace",
                description: `Facebook Marketplace item: ${parsed.marketplace_listing_title}.`,
                timestamp: new Date().toISOString(),
                url: `https://www.facebook.com/marketplace/item/${parsed.id}/`,
              });
            }
          } catch {
            // Ignore parse errors on individual JSON matches
          }
        });
      }
    }
  } catch (err) {
    console.error("Marketplace fetch error:", err);
  }
  return drafts;
}

function computeDealScore(price: number, median: number | null): number {
  if (median === null || median <= 0) return 7;
  const ratio = price / median;
  const raw = 10 - (ratio - 0.5) * 10;
  return Math.min(10, Math.max(1, Math.round(raw)));
}

function parseRequest(input: Record<string, unknown>): Required<ScrapeRequest> {
  const rawQuery = typeof input.query === "string" ? input.query.trim() : "";
  const finalQuery = rawQuery.length > 0 ? rawQuery.slice(0, 120) : "brz";

  return {
    query: finalQuery,
    maxDistance: 2500,
    minDealScore: 1,
    originLat: typeof input.originLat === "number" ? input.originLat : DEFAULT_ORIGIN.lat,
    originLng: typeof input.originLng === "number" ? input.originLng : DEFAULT_ORIGIN.lng,
  };
}

async function runScrape(request: Required<ScrapeRequest>): Promise<ScrapeResponse> {
  const startedAt = Date.now();

  const [craigsDrafts, ebayDrafts, fbDrafts] = await Promise.all([
    fetchCraigslist(request.query, request.originLat, request.originLng),
    fetchEbay(request.query, request.originLat, request.originLng),
    fetchMarketplace(request.query, request.originLat, request.originLng),
  ]);

  const drafts = [...craigsDrafts, ...ebayDrafts, ...fbDrafts];

  const enriched: Listing[] = drafts.map((draft) => {
    const market = lookupMarket(draft.title);
    const median = market?.median ?? null;

    return {
      id: draft.id,
      title: draft.title,
      price: draft.price,
      location: draft.location,
      distanceMiles: 5.2,
      imageUrl: draft.imageUrl,
      sourcePlatform: draft.sourcePlatform,
      description: draft.description,
      dealScore: computeDealScore(draft.price, median),
      isScam: false,
      scamReasoning: null,
      timestamp: draft.timestamp,
      marketMedian: median,
      url: draft.url,
    } as Listing;
  });

  const sources: Record<SourcePlatform, number> = {
    eBay: ebayDrafts.length,
    Marketplace: fbDrafts.length,
    Craigs: craigsDrafts.length,
  };

  const meta: ScrapeMeta = {
    totalScraped: drafts.length,
    returned: enriched.length,
    scamCount: 0,
    durationMs: Date.now() - startedAt,
    scrapedAt: new Date().toISOString(),
    origin: {
      label: "Local Area",
      lat: request.originLat,
      lng: request.originLng,
    },
    sources,
  };

  return { listings: enriched, meta };
}

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const result = await runScrape(parseRequest(body as Record<string, unknown>));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const result = await runScrape(parseRequest(params));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}