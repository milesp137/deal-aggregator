export type SourcePlatform = "eBay" | "Marketplace" | "Craigs";

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
}

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
