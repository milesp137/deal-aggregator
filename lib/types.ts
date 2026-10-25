export type SourcePlatform = "eBay" | "Marketplace" | "Craigs" | "ShopGoodwill" | "BaT" | "Reverb";

/**
 * Facebook Marketplace is switched OFF on the live site for now: it is not offered in the source
 * picker, never searched (even by an old saved search or alert), and never sent to the scraper.
 * All of its code (lib/facebook.ts, the Marketplace branch in app/api/scrape/route.ts) is kept so
 * it can come back by flipping this to true.
 */
export const MARKETPLACE_ENABLED = false;

/** Every platform that can be searched, in display order. */
export const ALL_SOURCES: SourcePlatform[] = (
  ["Marketplace", "eBay", "Craigs", "ShopGoodwill", "BaT", "Reverb"] as SourcePlatform[]
).filter((source) => MARKETPLACE_ENABLED || source !== "Marketplace");

/** The sources that existed before ShopGoodwill, Bring a Trailer and Reverb were added. */
export const ORIGINAL_SOURCES: SourcePlatform[] = (
  ["Marketplace", "eBay", "Craigs"] as SourcePlatform[]
).filter((source) => ALL_SOURCES.includes(source));

export const SOURCE_NAMES: Record<SourcePlatform, string> = {
  Marketplace: "Facebook Marketplace",
  eBay: "eBay",
  Craigs: "Craigslist",
  ShopGoodwill: "ShopGoodwill",
  BaT: "Bring a Trailer",
  Reverb: "Reverb",
};

/** Text on the small badge over each listing photo. */
export const SOURCE_BADGES: Record<SourcePlatform, string> = {
  Marketplace: "Marketplace",
  eBay: "eBay",
  Craigs: "Craigs",
  ShopGoodwill: "ShopGoodwill",
  BaT: "Bring a Trailer",
  Reverb: "Reverb",
};

/** Present on auction listings, where `price` is the current bid rather than a final price. */
export interface AuctionInfo {
  /** ISO-8601 time the auction closes. */
  endsAt: string;
  /** Number of bids so far, when the site says. */
  bids: number | null;
}

/** A normalized listing, identical in shape regardless of which platform it came from. */
export interface Listing {
  id: string;
  title: string;
  /** Asking price in USD. */
  price: number;
  /** Human readable "City, ST". */
  location: string;
  /** Great-circle distance from the search origin, in miles. */
  /** null when the platform gives no coordinates (e.g. shipped eBay items). */
  distanceMiles: number | null;
  /** First photo of the post. */
  imageUrl: string;
  sourcePlatform: SourcePlatform;
  description: string;
  /**
   * 1 (overpriced) to 10 (steal), based on price vs. market median. Auctions have no score
   * (always 0), because a current bid isn't what the item will sell for.
   */
  dealScore: number;
  /** Set for auctions; see AuctionInfo. */
  auction?: AuctionInfo;
  isScam: boolean;
  /** Human readable explanation of every red flag; null when the listing looks clean. */
  scamReasoning: string | null;
  /** ISO-8601 timestamp of when the listing was posted. */
  timestamp: string;
  /** Market median used for scoring; null when no comparable data exists. */
  marketMedian: number | null;
  /** Direct link to the individual post on its platform. */
  url?: string;
  /** True for built-in sample data (not a real post). */
  isSample?: boolean;
  /** Plain-English breakdown of how dealScore was reached (shown in the card's "Why this score?"). */
  scoreReasons?: ScoreReason[];
}

export interface ScoreReason {
  text: string;
  tone: "good" | "bad" | "neutral";
}

export type SortMode = "best" | "deal" | "newest" | "price_asc" | "price_desc";

export const SORT_LABELS: Record<SortMode, string> = {
  best: "Best match",
  deal: "Best deal score",
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

/** A power-user rule: "tell me when <keyword> shows up under <maxPrice>". */
export interface AlertKeyword {
  id: string;
  keyword: string;
  /** Only alert at or below this price; null means any price. */
  maxPrice: number | null;
  /** Only alert at or above this deal score (1-10). */
  minDealScore: number;
  enabled: boolean;
  /** ISO-8601 creation time. */
  createdAt: string;
}

export interface ScrapeRequest {
  query: string;
  /** Miles from origin. Values >= 1500 mean "any distance". */
  maxDistance: number;
  minDealScore: number;
  /** Platforms to search. Omitted or empty means all of them. */
  sources?: SourcePlatform[];
  /** Price range in USD; 0 means no limit. */
  minPrice?: number;
  maxPrice?: number;
  sort?: SortMode;
  /** ISO country code; only items located there. Empty means anywhere. */
  country?: string;
  originLat?: number;
  originLng?: number;
  /** Which home-page category to browse when `query` is blank (see lib/categories.ts). */
  category?: string;
}

export interface ScrapeMeta {
  /** The search these results are for ("" while browsing a category). */
  query: string;
  /** Category browsed when the search was blank. */
  category: string;
  /** Ways to narrow a broad search, built from the results (empty for blank or specific searches). */
  suggestions: { label: string; query: string; count: number }[];
  /** Listings gathered from all sources before any filtering. */
  totalScraped: number;
  returned: number;
  /** Plan used for this response; limits are enforced server-side. */
  plan: "free" | "pro";
  /** Matching listings hidden because of the plan's result cap. */
  lockedCount: number;
  /** Listings hidden because they were posted inside the free plan's delay window. */
  delayedCount: number;
  /** Of the delayed listings, how many scored 7+ (good deals). */
  delayedHotCount: number;
  scamCount: number;
  durationMs: number;
  scrapedAt: string;
  origin: { label: string; lat: number; lng: number };
  sources: Record<SourcePlatform, number>;
  /** Whether each platform returned real scraped data (false = sample fallback). */
  live: Record<SourcePlatform, boolean>;
  /** Reason a platform returned no live data (blocked, missing API keys, timeout). */
  errors: Partial<Record<SourcePlatform, string>>;
}

export interface ScrapeResponse {
  listings: Listing[];
  meta: ScrapeMeta;
}

export interface AlertHit {
  id: string;
  listingId: string;
  title: string;
  price: number;
  keyword: string;
}
