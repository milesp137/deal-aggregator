import { placeholderImage } from "./placeholder";
import { MIN_REAL_PRICE, titleMatchesQuery, type ListingDraft } from "./scrapers";

/**
 * ShopGoodwill, Bring a Trailer and Reverb. All three publish their listings in plain JSON /
 * page data that needs no login, and don't fight bots the way Facebook does, so they make a
 * sturdier base than Marketplace.
 *
 * ShopGoodwill and Bring a Trailer are mostly auctions. For those, `price` is the CURRENT BID
 * and the draft carries `auction` so the rest of the app never scores them as a deal.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_AGE_MS = 5 * 60_000;

function timeoutFetch(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(ms),
  });
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const stripHtml = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ ShopGoodwill */

interface ShopGoodwillItem {
  itemId: number;
  title: string;
  catFullName?: string | null;
  currentPrice: number;
  numBids: number;
  startTime: string;
  endTime: string;
  buyNowPrice: number;
  imageURL?: string | null;
  shippingPrice?: number;
}

/** ShopGoodwill reports times as Pacific wall-clock time with no zone. */
function pacificOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(utcMs));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asIfUtc = Date.UTC(+value.year, +value.month - 1, +value.day, +value.hour, +value.minute, +value.second);
  return Math.round((asIfUtc - utcMs) / 60_000);
}

export function pacificToIso(local: string): string | null {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(asUtc - pacificOffsetMinutes(asUtc) * 60_000).toISOString();
}

export async function scrapeShopGoodwill(query: string, limit = 24): Promise<ListingDraft[]> {
  const response = await timeoutFetch("https://buyerapi.shopgoodwill.com/api/Search/ItemListing", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      searchText: query,
      selectedCategoryIds: "",
      selectedGroup: "",
      selectedSellerIds: "",
      lowPrice: "0",
      highPrice: "999999",
      searchBuyNowOnly: "",
      searchPickupOnly: "false",
      searchNoPickupOnly: "false",
      searchOneCentShippingOnly: "false",
      searchDescriptions: "false",
      searchClosedAuctions: "false",
      closedAuctionEndingDate: "1/1/2026",
      closedAuctionDaysBack: "7",
      searchCanadaShipping: "false",
      searchInternationalShippingOnly: "false",
      sortColumn: "1", // ending soonest
      page: "1",
      pageSize: String(Math.min(Math.max(limit * 2, 24), 60)),
      sortDescending: "false",
      savedSearchId: 0,
      useBuyerPrefs: "true",
      searchUSOnlyShipping: "true",
      categoryLevelNo: "1",
      categoryLevel: 1,
      categoryId: 0,
      partNumber: "",
      catIds: "",
    }),
  });
  if (!response.ok) throw new Error(`ShopGoodwill returned HTTP ${response.status}`);
  const data = (await response.json()) as { searchResults?: { items?: ShopGoodwillItem[] } };
  const items = data.searchResults?.items;
  if (!Array.isArray(items)) throw new Error("ShopGoodwill returned an unexpected response");

  const now = Date.now();
  const drafts: ListingDraft[] = [];
  for (const item of items) {
    if (drafts.length >= limit) break;
    const title = decodeEntities(item.title ?? "").trim();
    if (!title || !titleMatchesQuery(title, query)) continue;

    const isBuyNow = item.buyNowPrice > 0;
    const price = Math.round(isBuyNow ? item.buyNowPrice : item.currentPrice);
    if (!(price > 0) || (isBuyNow && price < MIN_REAL_PRICE)) continue;

    const endsAt = pacificToIso(item.endTime);
    if (!isBuyNow && (!endsAt || new Date(endsAt).getTime() <= now)) continue;
    const started = pacificToIso(item.startTime);
    const posted = started && new Date(started).getTime() <= now ? started : new Date(now).toISOString();

    const category = (item.catFullName ?? "").replace(/^.*>\s*/, "").trim();
    const shipping = item.shippingPrice && item.shippingPrice > 0 ? `+ $${Math.round(item.shippingPrice)} shipping` : "";
    const image = (item.imageURL ?? "").replace(/\\/g, "/");

    drafts.push({
      id: `sgw-${item.itemId}`,
      title,
      price,
      location: "Ships from the US",
      lat: null,
      lng: null,
      imageUrl: image.startsWith("http") ? image : placeholderImage(title, String(item.itemId)),
      sourcePlatform: "ShopGoodwill",
      description: [category, shipping].filter(Boolean).join(" \u00b7 "),
      timestamp: posted,
      url: `https://shopgoodwill.com/item/${item.itemId}`,
      ...(isBuyNow || !endsAt ? {} : { auction: { endsAt, bids: item.numBids ?? 0 } }),
    });
  }
  return drafts;
}

/* ------------------------------------------------------------- Bring a Trailer */

interface BatItem {
  id: number;
  title: string;
  active?: boolean;
  current_bid?: number | null;
  timestamp_end?: number;
  thumbnail_url?: string;
  url?: string;
  country?: string | null;
  lat?: string | number | null;
  lon?: string | number | null;
  excerpt?: string | null;
  noreserve?: boolean;
}

const BAT_AUCTION_DAYS = 7;
let batCache: { at: number; items: Promise<BatItem[]> } | null = null;

async function loadBatAuctions(): Promise<BatItem[]> {
  const response = await timeoutFetch("https://bringatrailer.com/auctions/", {
    headers: { Accept: "text/html" },
  }, 12_000);
  if (!response.ok) throw new Error(`Bring a Trailer returned HTTP ${response.status}`);
  const html = await response.text();

  const marker = "var auctionsCurrentInitialData = ";
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("Bring a Trailer page had no auction data");
  const from = start + marker.length;
  // The data sits on one line (newlines inside the JSON are escaped), so the line end is the end.
  const line = html.slice(from, html.indexOf("\n", from)).trim().replace(/;$/, "");
  const data = JSON.parse(line) as { items?: BatItem[] };
  if (!Array.isArray(data.items)) throw new Error("Bring a Trailer data had an unexpected shape");
  return data.items;
}

/** The live auctions page is ~2 MB, so share one download between keywords and recent searches. */
function batAuctions(): Promise<BatItem[]> {
  if (batCache && Date.now() - batCache.at < MAX_AGE_MS) return batCache.items;
  const items = loadBatAuctions();
  batCache = { at: Date.now(), items };
  items.catch(() => {
    if (batCache?.items === items) batCache = null; // don't cache failures
  });
  return items;
}

export async function scrapeBringATrailer(query: string, limit = 24): Promise<ListingDraft[]> {
  const items = await batAuctions();
  const now = Date.now();

  const live = items
    .filter(
      (item) =>
        item.active !== false &&
        typeof item.title === "string" &&
        typeof item.timestamp_end === "number" &&
        item.timestamp_end * 1000 > now + 60_000 &&
        typeof item.current_bid === "number" &&
        item.current_bid > 0 &&
        item.url,
    )
    .sort((a, b) => (a.timestamp_end as number) - (b.timestamp_end as number));

  const drafts: ListingDraft[] = [];
  for (const item of live) {
    if (drafts.length >= limit) break;
    const title = decodeEntities(item.title).trim();
    if (!titleMatchesQuery(title, query)) continue;

    const endsAtMs = (item.timestamp_end as number) * 1000;
    const posted = Math.min(now, endsAtMs - BAT_AUCTION_DAYS * 86_400_000);
    const lat = item.lat === null || item.lat === undefined ? NaN : Number(item.lat);
    const lng = item.lon === null || item.lon === undefined ? NaN : Number(item.lon);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

    drafts.push({
      id: `bat-${item.id}`,
      title,
      price: Math.round(item.current_bid as number),
      location: item.country || "Online auction",
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      imageUrl: item.thumbnail_url?.startsWith("http") ? item.thumbnail_url : placeholderImage(title, String(item.id)),
      sourcePlatform: "BaT",
      description: item.excerpt ? stripHtml(item.excerpt).slice(0, 220) : item.noreserve ? "No reserve" : "",
      timestamp: new Date(posted).toISOString(),
      url: item.url as string,
      auction: { endsAt: new Date(endsAtMs).toISOString(), bids: null },
    });
  }
  return drafts;
}

/* ------------------------------------------------------------------------ Reverb */

interface ReverbListing {
  id: number;
  title: string;
  description?: string | null;
  condition?: { display_name?: string } | null;
  price?: { amount?: string; currency?: string } | null;
  buyer_price?: { amount?: string; currency?: string } | null;
  auction?: boolean;
  created_at?: string;
  published_at?: string;
  photos?: { _links?: { large_crop?: { href?: string }; full?: { href?: string } } }[];
  _links?: { web?: { href?: string } };
}

export async function scrapeReverb(query: string, limit = 24): Promise<ListingDraft[]> {
  const url = new URL("https://reverb.com/api/listings");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(Math.max(limit * 2, 24), 50)));
  url.searchParams.set("ships_to", "US");
  url.searchParams.set("state", "live");

  const response = await timeoutFetch(url.toString(), {
    headers: { "Accept-Version": "3.0", Accept: "application/json", "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Reverb returned HTTP ${response.status}`);
  const data = (await response.json()) as { listings?: ReverbListing[] };
  if (!Array.isArray(data.listings)) throw new Error("Reverb returned an unexpected response");

  const drafts: ListingDraft[] = [];
  for (const listing of data.listings) {
    if (drafts.length >= limit) break;
    if (listing.auction) continue; // the rare auction has no fixed price to compare
    const title = decodeEntities(listing.title ?? "").trim();
    if (!title || !titleMatchesQuery(title, query)) continue;

    const money = listing.buyer_price ?? listing.price;
    if (money?.currency && money.currency !== "USD") continue;
    const price = Math.round(parseFloat(money?.amount ?? ""));
    if (!Number.isFinite(price) || price < MIN_REAL_PRICE) continue;

    const image = listing.photos?.[0]?._links?.large_crop?.href ?? listing.photos?.[0]?._links?.full?.href ?? "";
    const link = listing._links?.web?.href;
    if (!link) continue;
    const condition = listing.condition?.display_name;
    const body = stripHtml(listing.description ?? "").slice(0, 220);

    drafts.push({
      id: `reverb-${listing.id}`,
      title,
      price,
      location: "Ships from seller",
      lat: null,
      lng: null,
      imageUrl: image.startsWith("http") ? image : placeholderImage(title, String(listing.id)),
      sourcePlatform: "Reverb",
      description: [condition, body].filter(Boolean).join(". "),
      timestamp: listing.published_at ?? listing.created_at ?? new Date().toISOString(),
      url: link,
    });
  }
  return drafts;
}
