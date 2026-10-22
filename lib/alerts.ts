import type { AlertKeyword, Listing } from "./types";

/**
 * Pure matcher shared by the dashboard. Every word of the keyword must appear in the
 * title or description, the price/score thresholds must pass, and scams never alert.
 */
export function matchesAlert(listing: Listing, alert: AlertKeyword): boolean {
  if (!alert.enabled || listing.isScam) return false;
  if (alert.maxPrice !== null && listing.price > alert.maxPrice) return false;
  if (listing.dealScore < alert.minDealScore) return false;

  const haystack = `${listing.title} ${listing.description}`.toLowerCase();
  const terms = alert.keyword.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}
