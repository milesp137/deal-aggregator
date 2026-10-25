export type SourcePlatform = "eBay" | "Marketplace" | "Craigs";

/** Every platform that can be searched, in display order. */
export const ALL_SOURCES: SourcePlatform[] = ["Marketplace", "eBay", "Craigs"];

export const SOURCE_NAMES: Record<SourcePlatform, string> = {
  Marketplace: "Facebook Marketplace",
  eBay: "eBay",
  Craigs: "Craigslist",
};

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
  /** 1 (overpriced) to 10 (steal), based on price vs. market median. */
  dealScore: number;
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
}

export interface ScrapeMeta {
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
