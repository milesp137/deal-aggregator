import type { AlertKeyword, Listing } from "./types";

/**
 * Pure matcher shared by the dashboard. Every word of the keyword must appear in the
 * title or description, the price/score thresholds must pass, and scams never alert.
 * Auctions have no deal score, so the score threshold doesn't apply to them (the max price
 * is checked against the current bid).
 */
export function matchesAlert(listing: Listing, alert: AlertKeyword): boolean {
  if (!alert.enabled || listing.isScam) return false;
  if (alert.maxPrice !== null && listing.price > alert.maxPrice) return false;
  if (!listing.auction && listing.dealScore < alert.minDealScore) return false;

  const haystack = `${listing.title} ${listing.description}`.toLowerCase();
  const terms = alert.keyword.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}
