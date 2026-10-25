/**
 * Deal scoring, 1 (overpriced) to 10 (steal).
 *
 * The score is mostly price versus what similar listings in the SAME search cost right now (a
 * trimmed median of the results), because that adapts to anything someone searches for. The
 * built-in market table is only a fallback when a search returns too few listings to compare.
 * Small adjustments for condition wording, freshness, distance and photo quality break ties so
 * listings at the same price don't all land on the same number.
 */

import type { ScoreReason } from "./types";

/** Fewest similar listings needed before their prices are trusted as the reference. */
export const MIN_PEERS = 5;
/** With at least this many peers, a listing's price rank is blended into the score. */
const MIN_PEERS_FOR_RANK = 8;

export interface PriceReference {
  median: number;
  source: "peers" | "market";
  /** Sorted peer prices, when the reference came from the search results. */
  peerPrices: number[] | null;
}

/** Median after dropping the cheapest and priciest 10%, so a few outliers don't skew it. */
export function trimmedMedian(prices: number[]): number {
  const sorted = [...prices].sort((a, b) => a - b);
  const trim = sorted.length >= 10 ? Math.floor(sorted.length * 0.1) : 0;
  const core = sorted.slice(trim, sorted.length - trim);
  const mid = Math.floor(core.length / 2);
  return core.length % 2 === 1 ? core[mid] : (core[mid - 1] + core[mid]) / 2;
}

/**
 * Listings priced more than this many times above or below the middle are probably a different
 * kind of item (a $70 mouse-pad plate among $400 wheels), so they are left out of the average.
 * Deliberately wide: only clearly different items are dropped, not merely cheap or pricey ones.
 */
const OUTLIER_FACTOR = 3;

/** Priced under this fraction of similar listings: a different item or too good to be true. */
const VERY_LOW_RATIO = 0.25;

export function buildReference(peerPrices: number[], marketMedian: number | null): PriceReference | null {
  if (peerPrices.length >= MIN_PEERS) {
    const sorted = [...peerPrices].sort((a, b) => a - b);
    const rough = trimmedMedian(sorted);
    const similar = sorted.filter((p) => p >= rough / OUTLIER_FACTOR && p <= rough * OUTLIER_FACTOR);
    // Only use the filtered set if enough comparable listings remain.
    const core = similar.length >= MIN_PEERS ? similar : sorted;
    return { median: trimmedMedian(core), source: "peers", peerPrices: core };
  }
  if (marketMedian !== null && marketMedian > 0) {
    return { median: marketMedian, source: "market", peerPrices: null };
  }
  return null;
}

/** price / median -> score. Piecewise linear: 40% of typical or less is 10, double is 1. */
const CURVE: ReadonlyArray<readonly [number, number]> = [
  [0.4, 10],
  [0.55, 9.3],
  [0.7, 8],
  [0.85, 6.5],
  [1, 5],
  [1.15, 4],
  [1.4, 2.5],
  [1.8, 1],
];

function curve(ratio: number): number {
  if (ratio <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [x1, y1] = CURVE[i];
    if (ratio <= x1) {
      const [x0, y0] = CURVE[i - 1];
      return y0 + ((y1 - y0) * (ratio - x0)) / (x1 - x0);
    }
  }
  return CURVE[CURVE.length - 1][1];
}

/** 0-10 from price alone; 5 (neutral) when there is nothing to compare against. */
export function priceScore(price: number, reference: PriceReference | null): number {
  if (!reference || reference.median <= 0) return 5;
  const ratioScore = curve(price / reference.median);

  const peers = reference.peerPrices;
  if (peers && peers.length >= MIN_PEERS_FOR_RANK) {
    // Share of comparable listings that cost more than this one (ties count half).
    const above = peers.filter((p) => p > price).length;
    const equal = peers.filter((p) => p === price).length;
    const rankScore = 1 + 9 * ((above + equal / 2) / peers.length);
    return 0.65 * ratioScore + 0.35 * rankScore;
  }
  return ratioScore;
}

const POSITIVE_WORDS =
  /\b(?:brand new|new in box|sealed|nib|mint|like new|excellent|barely used|complete in box|cib|low miles)\b/i;
const NEGATIVE_WORDS =
  /\b(?:cracked|scratched|scratches|broken|damaged|untested|needs (?:repair|work)|no charger|not working|doesn'?t work|salvage|read description)\b/i;

export interface ScoreInput {
  price: number;
  title: string;
  description: string;
  /** ISO-8601 post time. */
  timestamp: string;
  /** null when the site gives no location (shipped eBay items, Marketplace). */
  distanceMiles: number | null;
  imageUrl: string;
  /** 0 = the item itself, 1 = made for it ("case for PSP"), 2 = accessory/junk. */
  relevanceTier: 0 | 1 | 2;
  /** True for blank "browse" searches, where unrelated items share one price comparison. */
  broadSearch?: boolean;
}

export interface ScoreResult {
  score: number;
  reasons: ScoreReason[];
}

const usd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/** Final 1-10 score plus a plain-English list of what moved it. */
export function scoreListing(input: ScoreInput, reference: PriceReference | null, now: number): ScoreResult {
  const reasons: ScoreReason[] = [];
  let score = priceScore(input.price, reference);
  let veryLow = false;

  if (reference && reference.median > 0) {
    const ratio = input.price / reference.median;
    const percent = Math.round(Math.abs(ratio - 1) * 100);
    const basis =
      reference.source === "peers"
        ? `similar listings in this search (${reference.peerPrices?.length ?? 0} compared)`
        : "this kind of item (market estimate)";
    if (reference.source === "peers" && ratio < VERY_LOW_RATIO) {
      // Not a real bargain: far too cheap to be the same thing as the other results.
      veryLow = true;
      reasons.push({
        text: `Priced at only ${Math.round(ratio * 100)}% of similar listings, so it's probably a different item (an accessory or part) or too good to be true`,
        tone: "bad",
      });
    } else if (ratio <= 0.97) {
      reasons.push({ text: `${percent}% below the typical ${usd(reference.median)} for ${basis}`, tone: "good" });
    } else if (ratio >= 1.03) {
      reasons.push({ text: `${percent}% above the typical ${usd(reference.median)} for ${basis}`, tone: "bad" });
    } else {
      reasons.push({ text: `Right around the typical ${usd(reference.median)} for ${basis}`, tone: "neutral" });
    }

    const peers = reference.peerPrices;
    if (peers && peers.length >= MIN_PEERS_FOR_RANK) {
      const cheaperThan = Math.round((peers.filter((p) => p > input.price).length / peers.length) * 100);
      reasons.push({
        text: `Cheaper than ${cheaperThan}% of similar listings`,
        tone: cheaperThan >= 70 ? "good" : cheaperThan <= 30 ? "bad" : "neutral",
      });
    }
  } else {
    reasons.push({
      text: "Too few similar listings to judge the price, so this starts from a neutral 5",
      tone: "neutral",
    });
  }

  if (input.broadSearch) {
    // Cars, parts and accessories all share one pool here, so don't over-trust the comparison.
    score = 5 + (score - 5) * 0.6;
    reasons.push({
      text: "Browsing several topics at once, so the price comparison is rougher. Search for something specific for sharper scores",
      tone: "neutral",
    });
  }

  const text = `${input.title} ${input.description}`;
  if (POSITIVE_WORDS.test(text)) {
    score += 1;
    reasons.push({ text: "Wording suggests good condition (+1)", tone: "good" });
  }
  if (NEGATIVE_WORDS.test(text)) {
    score -= 1.5;
    reasons.push({ text: "Wording hints at wear or problems (-1.5)", tone: "bad" });
  }

  const ageHours = (now - new Date(input.timestamp).getTime()) / 3_600_000;
  if (Number.isFinite(ageHours)) {
    if (ageHours < 6) {
      score += 0.5;
      reasons.push({ text: "Posted in the last few hours (+0.5)", tone: "good" });
    } else if (ageHours > 24 * 30) {
      score -= 0.5;
      reasons.push({ text: "Posted over a month ago (-0.5)", tone: "bad" });
    }
  }

  if (input.distanceMiles !== null && input.distanceMiles <= 30) {
    score += 0.5;
    reasons.push({ text: "Close to you, under 30 miles (+0.5)", tone: "good" });
  }
  if (input.imageUrl.startsWith("data:image/svg")) {
    score -= 0.5; // no real photo
    reasons.push({ text: "No real photo (-0.5)", tone: "bad" });
  }

  if (veryLow) score = Math.min(score, 4);

  // Accessories and "made for it" parts aren't comparable to the item, so they can't be steals.
  const cap = input.relevanceTier === 2 ? 3 : input.relevanceTier === 1 ? 5 : null;
  if (cap !== null && score > cap) {
    score = cap;
    reasons.push({
      text: `Looks like an accessory or part for the item rather than the item itself, so the score is capped at ${cap}`,
      tone: "neutral",
    });
  }

  return { score: Math.min(10, Math.max(1, Math.round(score))), reasons };
}

