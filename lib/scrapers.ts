import * as cheerio from "cheerio";
import type { AuctionInfo, SellerInfo, SourcePlatform } from "./types";
import { placeholderImage } from "./placeholder";

/** A listing as scraped from a platform, before scoring / scam detection. */
export interface ListingDraft {
  id: string;
  title: string;
  price: number;
  location: string;
  /** null when the platform does not expose coordinates (e.g. eBay shipped items). */
  lat: number | null;
  lng: number | null;
  imageUrl: string;
  sourcePlatform: SourcePlatform;
  description: string;
  timestamp: string;
  /** Direct link to the individual post. */
  url: string;
  /** True when the data is built-in sample data rather than a real scraped post. */
  isSample?: boolean;
  /** Set for auctions: `price` is then the current bid, not a final price. */
  auction?: AuctionInfo;
  /** Seller reputation, when the site provides it. */
  seller?: SellerInfo;
  /** The scraper knows this is the thing itself (it came from a vehicles-only search), not a part. */
  kindHint?: "item";
}

export interface Origin {
  lat: number;
  lng: number;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Prices under this are "contact me" placeholders ($1, $0), not real asking prices. */
export const MIN_REAL_PRICE = 5;

function parsePrice(raw: string | number): number | null {
  const value = typeof raw === "number" ? raw : parseFloat(`${raw}`.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value >= MIN_REAL_PRICE ? Math.round(value) : null;
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Every search word must appear in the TITLE, ignoring spaces and punctuation
 * ("240 SX" matches "240sx"). Keeps out posts that only mention the keyword in spammy bodies.
 */
export function titleMatchesQuery(title: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
  const lower = title.toLowerCase();
  const haystack = squash(title);
  return terms.every((term) => {
    // Pure numbers ("4090") may sit inside a longer token ("rtx4090").
    if (/^\d+$/.test(term)) return haystack.includes(term);
    // Anything with letters must START a word, so "ps5" no longer matches "FPS575".
    // One optional space or dash between characters keeps "240 SX" / "MX-5" working.
    // Not for 3-letter codes, or "ps5" would match the guitar pedal "Boss PS-5".
    // Car codes ("rx7" = "RX-7", "gtr" = "GT-R") are the exception: they are written both ways.
    const looseCode = term.length > 3 || (term.length === 3 && !/^(ps\d|xb\d|wii)$/.test(term));
    const pattern = term.split("").join(looseCode ? "[ -]?" : "");
    // Short model codes ("ps5", "s14") must also END the word, so "ps5" skips "PS59C turntable".
    const end = term.length <= 3 ? "(?![a-z0-9])" : "";
    return new RegExp(`(?:^|[^a-z0-9])${pattern}${end}`).test(lower);
  });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 7000): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(ms) });
}

/* ------------------------------------------------------------------ Craigslist */

const CRAIGSLIST_SITES = [
  { site: "losangeles", label: "Los Angeles", lat: 34.0522, lng: -118.2437 },
  { site: "sfbay", label: "SF Bay Area", lat: 37.7749, lng: -122.4194 },
  { site: "sandiego", label: "San Diego", lat: 32.7157, lng: -117.1611 },
  { site: "sacramento", label: "Sacramento", lat: 38.5816, lng: -121.4944 },
  { site: "seattle", label: "Seattle", lat: 47.6062, lng: -122.3321 },
  { site: "portland", label: "Portland", lat: 45.5152, lng: -122.6784 },
  { site: "phoenix", label: "Phoenix", lat: 33.4484, lng: -112.074 },
  { site: "lasvegas", label: "Las Vegas", lat: 36.1699, lng: -115.1398 },
  { site: "denver", label: "Denver", lat: 39.7392, lng: -104.9903 },
  { site: "saltlakecity", label: "Salt Lake City", lat: 40.7608, lng: -111.891 },
  { site: "dallas", label: "Dallas", lat: 32.7767, lng: -96.797 },
  { site: "houston", label: "Houston", lat: 29.7604, lng: -95.3698 },
  { site: "austin", label: "Austin", lat: 30.2672, lng: -97.7431 },
  { site: "minneapolis", label: "Minneapolis", lat: 44.9778, lng: -93.265 },
  { site: "chicago", label: "Chicago", lat: 41.8781, lng: -87.6298 },
  { site: "detroit", label: "Detroit", lat: 42.3314, lng: -83.0458 },
  { site: "atlanta", label: "Atlanta", lat: 33.749, lng: -84.388 },
  { site: "charlotte", label: "Charlotte", lat: 35.2271, lng: -80.8431 },
  { site: "miami", label: "Miami", lat: 25.7617, lng: -80.1918 },
  { site: "orlando", label: "Orlando", lat: 28.5383, lng: -81.3792 },
  { site: "washingtondc", label: "Washington DC", lat: 38.9072, lng: -77.0369 },
  { site: "philadelphia", label: "Philadelphia", lat: 39.9526, lng: -75.1652 },
  { site: "newyork", label: "New York", lat: 40.7128, lng: -74.006 },
  { site: "boston", label: "Boston", lat: 42.3601, lng: -71.0589 },
];

function distanceSquared(a: Origin, b: Origin): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
}

function nearestCraigslistSite(origin: Origin) {
  return CRAIGSLIST_SITES.reduce((best, site) =>
    distanceSquared(origin, site) < distanceSquared(origin, best) ? site : best,
  );
}

const CRAIGSLIST_MAX_RESULTS = 12;

/**
 * Scrapes the nearest Craigslist "for sale" search page, then opens each post to read its
 * first photo (og:image), coordinates, description and posted time. Every listing links to
 * the individual post.
 */
export async function scrapeCraigslist(
  query: string,
  origin: Origin,
  limit: number = CRAIGSLIST_MAX_RESULTS,
  /** "sss" = everything for sale; "cta" = the cars & trucks section (vehicles are not in "sss"). */
  section: "sss" | "cta" = "sss",
): Promise<ListingDraft[]> {
  const site = nearestCraigslistSite(origin);
  const searchUrl = `https://${site.site}.craigslist.org/search/${section}?query=${encodeURIComponent(query)}`;

  const response = await fetchWithTimeout(searchUrl, { headers: BROWSER_HEADERS });
  if (!response.ok) throw new Error(`Craigslist search returned ${response.status}`);
  const $ = cheerio.load(await response.text());

  const rows: { title: string; price: number; url: string; area: string }[] = [];
  $("li.cl-static-search-result").each((_, element) => {
    if (rows.length >= limit) return;
    const row = $(element);
    const url = row.find("a").first().attr("href");
    const title = cleanText(row.attr("title") ?? row.find(".title").first().text());
    const price = parsePrice(row.find(".price").first().text());
    if (!url || !title || price === null) return;
    // Craigslist's search also returns dealer spam that only mentions the keyword in the body.
    if (query && !titleMatchesQuery(title, query)) return;
    rows.push({ title, price, url, area: cleanText(row.find(".location").first().text()) });
  });

  const drafts = await Promise.all(
    rows.map(async (row): Promise<ListingDraft> => {
      let imageUrl = "";
      let description = "";
      // Search-result areas are sometimes street addresses; the post's geo tags are cleaner.
      let location = /^\d/.test(row.area) ? site.label : row.area || site.label;
      let lat: number | null = site.lat;
      let lng: number | null = site.lng;
      let timestamp = new Date().toISOString();

      try {
        const post = await fetchWithTimeout(row.url, { headers: BROWSER_HEADERS });
        if (post.ok) {
          const $post = cheerio.load(await post.text());
          imageUrl = $post('meta[property="og:image"]').attr("content") ?? "";
          const body = cleanText($post("#postingbody").text().replace("QR Code Link to This Post", ""));
          description = body || cleanText($post('meta[property="og:description"]').attr("content") ?? "");
          const placename = cleanText($post('meta[name="geo.placename"]').attr("content") ?? "");
          const region = ($post('meta[name="geo.region"]').attr("content") ?? "").replace(/^US-/, "");
          if (placename) location = region ? `${placename}, ${region}` : placename;
          const geo = ($post('meta[name="geo.position"]').attr("content") ?? "").split(";");
          const postLat = parseFloat(geo[0]);
          const postLng = parseFloat(geo[1]);
          if (Number.isFinite(postLat) && Number.isFinite(postLng)) {
            lat = postLat;
            lng = postLng;
          }
          const posted = new Date($post("time[datetime]").first().attr("datetime") ?? "");
          if (!Number.isNaN(posted.getTime())) timestamp = posted.toISOString();
        }
      } catch {
        // Keep the search-result data; the card still links to the post.
      }

      const id = row.url.split("/").filter(Boolean).pop() ?? row.url;
      return {
        id: `cl-${id}`,
        title: row.title,
        price: row.price,
        location,
        lat,
        lng,
        imageUrl: imageUrl || placeholderImage(row.title, id),
        sourcePlatform: "Craigs",
        description,
        timestamp,
        url: row.url,
        ...(section === "cta" ? { kindHint: "item" as const } : {}),
      };
    }),
  );

  return drafts;
}

/* ------------------------------------------------------------------------ eBay */

interface EbaySummary {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  image?: { imageUrl: string };
  additionalImages?: { imageUrl: string }[];
  thumbnailImages?: { imageUrl: string }[];
  itemWebUrl?: string;
  itemLocation?: { city?: string; stateOrProvince?: string; postalCode?: string; country?: string };
  itemCreationDate?: string;
  shortDescription?: string;
  condition?: string;
  seller?: { username?: string; feedbackPercentage?: string; feedbackScore?: number };
}

/** A photo used by this many listings in one search is a seller's stock image, not the item. */
const SHARED_IMAGE_MIN_USES = 3;
/** eBay listings below this are almost never real deals on cars, electronics or instruments. */
const EBAY_MIN_PRICE = 10;

const EBAY_IMAGE_SIZE = /\/s-l\d+\.(jpg|jpeg|png|webp)(?=$|\?)/i;

/** Identifies a picture regardless of the size variant in its URL. */
function ebayImageKey(url: string): string {
  return url.match(/\/g\/([^/]+)\//)?.[1] ?? url.replace(EBAY_IMAGE_SIZE, "");
}

/** eBay's API hands out small 225px thumbnails; ask for a sharper size. */
function sharpenEbayImage(url: string): string {
  return url.replace(EBAY_IMAGE_SIZE, "/s-l500.$1");
}

let ebayToken: { value: string; expiresAt: number } | null = null;

export function isEbayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

export async function getEbayToken(): Promise<string> {
  if (ebayToken && ebayToken.expiresAt > Date.now() + 60_000) return ebayToken.value;

  const credentials = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`,
  ).toString("base64");
  const response = await fetchWithTimeout("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!response.ok) throw new Error(`eBay auth returned ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  ebayToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/**
 * Uses eBay's official Browse API (eBay blocks HTML scraping). Requires EBAY_CLIENT_ID and
 * EBAY_CLIENT_SECRET (free at developer.ebay.com). Each listing links to its item page
 * (itemWebUrl) and uses the item's primary photo.
 */
export async function scrapeEbay(
  query: string,
  limit = 20,
  country = "",
  /** Single words the shopper wants left out; sent to eBay as "-word" so slots aren't wasted. */
  exclude: string[] = [],
): Promise<ListingDraft[]> {
  return (await searchEbay({ query, limit, country, exclude })).drafts;
}

/** One filter eBay can apply to a search, such as Transmission or Platform. */
export interface EbayFacet {
  name: string;
  values: { value: string; count: number }[];
}

export interface EbaySearchOptions {
  query: string;
  limit?: number;
  country?: string;
  exclude?: string[];
  /** eBay category id(s) to search inside, e.g. "6001" for Cars & Trucks. */
  categoryIds?: string;
  /** Asks eBay which filters (aspects) apply to these results. */
  wantFacets?: boolean;
  /** Item-specific filters to apply, e.g. { Transmission: "Manual" }; needs `aspectCategory`. */
  aspects?: Record<string, string>;
  aspectCategory?: string;
}

export interface EbaySearchResult {
  drafts: ListingDraft[];
  facets: EbayFacet[];
  /** eBay's main category for these results (what `aspects` must be filtered against). */
  categoryId: string | null;
  /** How many listings eBay matched in total (not just the page returned). */
  total: number;
}

interface EbayRefinement {
  dominantCategoryId?: string;
  aspectDistributions?: {
    localizedAspectName: string;
    aspectValueDistributions: { localizedAspectValue: string; matchCount: number; refinementHref?: string }[];
  }[];
}

const FACET_PRIORITY = [
  /^platform$/i,
  /^transmission$/i,
  /^(model )?year$/i,
  /^drive type$/i,
  /^brand$/i,
  /^type$/i,
  /^storage capacity$/i,
  /^(exterior )?colou?r$/i,
];
const FACET_MAX_FACETS = 5;
const FACET_MAX_VALUES = 8;
const FACET_MAX_YEARS = 70;

function toFacets(refinement: EbayRefinement | undefined): EbayFacet[] {
  const facets: EbayFacet[] = [];
  for (const aspect of refinement?.aspectDistributions ?? []) {
    const rank = FACET_PRIORITY.findIndex((pattern) => pattern.test(aspect.localizedAspectName));
    if (rank < 0) continue;
    const values = aspect.aspectValueDistributions
      // Values with these characters can't be sent back in eBay's filter syntax.
      .filter((entry) => !/[,{}|]/.test(entry.localizedAspectValue))
      .filter((entry) => !/^(not specified|does not apply|unknown)$/i.test(entry.localizedAspectValue))
      .map((entry) => ({ value: entry.localizedAspectValue, count: entry.matchCount }));
    if (values.length === 0) continue;
    const isYear = /year/i.test(aspect.localizedAspectName);
    // Sellers sometimes type nonsense years ("1900"); keep plausible ones only.
    if (isYear) {
      const limit = new Date().getFullYear() + 2;
      for (let i = values.length - 1; i >= 0; i--) {
        const year = Number(values[i].value);
        if (!(year >= 1920 && year <= limit)) values.splice(i, 1);
      }
      if (values.length === 0) continue;
    }
    values.sort((a, b) => (isYear ? Number(b.value) - Number(a.value) : b.count - a.count));
    // Every year is kept (oldest cars included); other filters show their most common values.
    facets.push({
      name: aspect.localizedAspectName,
      values: values.slice(0, isYear ? FACET_MAX_YEARS : FACET_MAX_VALUES),
    });
  }
  facets.sort(
    (a, b) =>
      FACET_PRIORITY.findIndex((pattern) => pattern.test(a.name)) -
      FACET_PRIORITY.findIndex((pattern) => pattern.test(b.name)),
  );
  return facets.slice(0, FACET_MAX_FACETS);
}

/** The leaf category eBay wants in aspect filters; it is written into each refinement link. */
function aspectCategoryOf(refinement: EbayRefinement | undefined): string | null {
  for (const aspect of refinement?.aspectDistributions ?? []) {
    for (const entry of aspect.aspectValueDistributions) {
      const match = entry.refinementHref?.match(/categoryId(?:%3A|:)(\d+)/i);
      if (match) return match[1];
    }
  }
  return refinement?.dominantCategoryId ?? null;
}

/** The raw aspect lists, used to turn typed words like "manual" into real eBay filters. */
export async function probeEbayAspects(
  query: string,
  categoryIds: string | undefined,
  country: string,
): Promise<{ aspects: NonNullable<EbayRefinement["aspectDistributions"]>; categoryId: string | null; total: number }> {
  const token = await getEbayToken();
  const filters = ["buyingOptions:{FIXED_PRICE}", `price:[${EBAY_MIN_PRICE}..]`, "priceCurrency:USD"];
  if (/^[A-Z]{2}$/.test(country)) filters.push(`itemLocationCountry:${country}`);
  const url =
    "https://api.ebay.com/buy/browse/v1/item_summary/search" +
    `?q=${encodeURIComponent(query)}&limit=1&fieldgroups=ASPECT_REFINEMENTS,MATCHING_ITEMS` +
    (categoryIds ? `&category_ids=${categoryIds}` : "") +
    `&filter=${encodeURIComponent(filters.join(","))}`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!response.ok) throw new Error(`eBay probe returned ${response.status}`);
  const json = (await response.json()) as { total?: number; refinement?: EbayRefinement };
  return {
    aspects: json.refinement?.aspectDistributions ?? [],
    categoryId: aspectCategoryOf(json.refinement),
    total: json.total ?? 0,
  };
}

export async function searchEbay(options: EbaySearchOptions): Promise<EbaySearchResult> {
  const { query, limit = 20, country = "", exclude = [], categoryIds, wantFacets, aspects, aspectCategory } = options;
  const token = await getEbayToken();
  // `country` (ISO code) limits results to items located there; empty means anywhere.
  const filters = [
    "buyingOptions:{FIXED_PRICE}",
    // Server-side price floor: $1-$9 dropship gadgets would otherwise use up result slots.
    `price:[${EBAY_MIN_PRICE}..]`,
    "priceCurrency:USD",
    ...(/^[A-Z]{2}$/.test(country) ? [`itemLocationCountry:${country}`] : []),
  ];
  const url =
    "https://api.ebay.com/buy/browse/v1/item_summary/search" +
    // No `sort` = eBay's "Best Match", which puts real guitars first. `sort=newlyListed` returned
    // whatever was uploaded last, which for broad words is pickup rings, straps and stands.
    `?q=${encodeURIComponent([query, ...exclude.filter((word) => /^[a-z0-9]+$/i.test(word)).map((word) => `-${word}`)].join(" "))}&limit=${limit}&filter=${encodeURIComponent(filters.join(","))}` +
    (categoryIds ? `&category_ids=${categoryIds}` : "") +
    (wantFacets ? "&fieldgroups=MATCHING_ITEMS,ASPECT_REFINEMENTS" : "") +
    (aspects && aspectCategory && Object.keys(aspects).length > 0
      ? `&aspect_filter=${encodeURIComponent(
          `categoryId:${aspectCategory},` +
            Object.entries(aspects)
              .map(([name, value]) => `${name}:{${value}}`)
              .join(","),
        )}`
      : "");
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!response.ok) throw new Error(`eBay search returned ${response.status}`);
  const json = (await response.json()) as {
    itemSummaries?: EbaySummary[];
    total?: number;
    refinement?: EbayRefinement;
  };

  const summaries = json.itemSummaries ?? [];

  // Some sellers (shops especially) upload one stock picture, such as "image not available" or
  // their logo, as the photo on every listing. A picture used by several listings in the same
  // results isn't a photo of the item, so prefer one of the item's other photos instead.
  const imageUses = new Map<string, number>();
  for (const item of summaries) {
    const first = item.image?.imageUrl;
    if (first) imageUses.set(ebayImageKey(first), (imageUses.get(ebayImageKey(first)) ?? 0) + 1);
  }
  const isSharedImage = (url: string) => (imageUses.get(ebayImageKey(url)) ?? 0) >= SHARED_IMAGE_MIN_USES;

  // The same stock photo at the same price on several listings is one dropshipped product posted
  // repeatedly. Keep the first; listings sharing a photo at DIFFERENT prices are left alone.
  const seenPhotoPrice = new Set<string>();

  const drafts = summaries.flatMap((item): ListingDraft[] => {
    const price = item.price ? parsePrice(item.price.value) : null;
    if (price === null || !item.itemWebUrl) return [];
    // eBay can match a word that only appears in the description or a hidden item specific.
    // Require every search word in the title itself.
    if (query && !titleMatchesQuery(cleanText(item.title), query)) return [];
    const firstImage = item.image?.imageUrl;
    if (firstImage && isSharedImage(firstImage)) {
      const key = `${ebayImageKey(firstImage)}|${price}`;
      if (seenPhotoPrice.has(key)) return [];
      seenPhotoPrice.add(key);
    }
    const photos = [
      item.image?.imageUrl,
      ...(item.additionalImages ?? []).map((image) => image.imageUrl),
      ...(item.thumbnailImages ?? []).map((image) => image.imageUrl),
    ].filter((url): url is string => Boolean(url));
    const ownPhoto = photos.find((url) => !isSharedImage(url));
    const title = cleanText(item.title);
    const place = item.itemLocation;
    const location = [place?.city, place?.stateOrProvince].filter(Boolean).join(", ");
    const feedbackPercent = Number.parseFloat(item.seller?.feedbackPercentage ?? "");
    const seller: SellerInfo | undefined = item.seller
      ? {
          name: item.seller.username,
          ...(Number.isFinite(feedbackPercent) ? { feedbackPercent } : {}),
          ...(typeof item.seller.feedbackScore === "number"
            ? { feedbackCount: item.seller.feedbackScore }
            : {}),
        }
      : undefined;
    return [
      {
        id: `ebay-${item.itemId}`,
        ...(seller ? { seller } : {}),
        title,
        price,
        location: location || (place?.country ? `Ships from ${place.country}` : "Ships from US"),
        lat: null,
        lng: null,
        imageUrl: ownPhoto ? sharpenEbayImage(ownPhoto) : placeholderImage(title, item.itemId),
        sourcePlatform: "eBay",
        description: cleanText(item.shortDescription ?? item.condition ?? ""),
        timestamp: item.itemCreationDate
          ? new Date(item.itemCreationDate).toISOString()
          : new Date().toISOString(),
        url: item.itemWebUrl,
        // Everything in the vehicles category IS a vehicle, never a part.
        ...(categoryIds === VEHICLES_CATEGORY ? { kindHint: "item" as const } : {}),
      },
    ];
  });

  return {
    drafts,
    facets: wantFacets ? toFacets(json.refinement) : [],
    categoryId: aspectCategoryOf(json.refinement),
    total: json.total ?? drafts.length,
  };
}

/** eBay Motors > Cars & Trucks. */
export const VEHICLES_CATEGORY = "6001";
