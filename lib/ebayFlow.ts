import {
  probeEbayAspects,
  searchEbay,
  VEHICLES_CATEGORY,
  type EbayFacet,
  type ListingDraft,
} from "./scrapers";
import { parseTypedFilters, type TypedFilter } from "./queryFilters";

export interface ResolvedFilters {
  /** The search text once the filter words are taken out of it. */
  query: string;
  /** Typed words that became real eBay filters. */
  applied: { filter: TypedFilter; name: string; value: string }[];
  /** Typed filters eBay supports for this search but has no listings for (no manual Cherokees). */
  unavailable: TypedFilter[];
  aspects: Record<string, string>;
  aspectCategory: string;
  /** Category the filters apply inside ("" = all categories). */
  scope: string;
}

/**
 * Checks, with eBay, whether the typed filter words ("manual", "ps3", "1999") are filters this
 * search really has. Returns null when they are not, so they stay ordinary search words.
 */
export async function resolveTypedFilters(query: string, country: string): Promise<ResolvedFilters | null> {
  const parsed = parseTypedFilters(query);
  if (parsed.filters.length === 0) return null;

  // Vehicle words are looked up among cars first; the rest among everything first.
  const scopes = parsed.filters.some((filter) => filter.vehicle) ? [VEHICLES_CATEGORY, ""] : ["", VEHICLES_CATEGORY];
  const probes = await Promise.all(
    scopes.map((scope) => probeEbayAspects(parsed.query, scope || undefined, country).catch(() => null)),
  );

  for (let i = 0; i < scopes.length; i++) {
    const probe = probes[i];
    if (!probe || probe.total === 0 || !probe.categoryId) continue;
    const named = parsed.filters.map((filter) => ({
      filter,
      aspect: probe.aspects.find((entry) => filter.aspect.test(entry.localizedAspectName)),
    }));
    if (named.some((entry) => !entry.aspect)) continue;

    const applied: ResolvedFilters["applied"] = [];
    const unavailable: TypedFilter[] = [];
    const aspects: Record<string, string> = {};
    for (const { filter, aspect } of named) {
      const entry = aspect!.aspectValueDistributions.find(
        (candidate) => filter.value.test(candidate.localizedAspectValue) && !/[,{}|]/.test(candidate.localizedAspectValue),
      );
      if (entry) {
        applied.push({ filter, name: aspect!.localizedAspectName, value: entry.localizedAspectValue });
        aspects[aspect!.localizedAspectName] = entry.localizedAspectValue;
      } else {
        unavailable.push(filter);
      }
    }
    return {
      query: parsed.query,
      applied,
      unavailable,
      aspects,
      aspectCategory: probe.categoryId,
      scope: scopes[i],
    };
  }
  return null;
}

/** Cars & trucks matches needed before a search counts as a vehicle search. */
const VEHICLE_SEARCH_MIN_CARS = 3;

export interface EbayFlowInput {
  query: string;
  limit: number;
  country: string;
  exclude: string[];
  aspects: Record<string, string>;
  aspectCategory: string;
  /** Category the aspects belong to ("" = all categories). */
  scope: string;
}

export interface EbayFlowOutput {
  drafts: ListingDraft[];
  /** True when this looks like a search for a car/truck (so parts and toy models are not "the item"). */
  vehicleSearch: boolean;
  facets: EbayFacet[];
  /** Category the returned facets belong to; sent back when the shopper picks one. */
  facetScope: string;
  facetCategory: string | null;
}

/**
 * A typed eBay search. Vehicles live in their own category and are drowned out by parts in a
 * general search (60 Cherokee parts, 3 Cherokees), so unless only parts were asked for, the cars
 * & trucks category is searched too. eBay also reports which filters apply to the results.
 */
export async function ebayFlow(input: EbayFlowInput): Promise<EbayFlowOutput> {
  const hasAspects = Object.keys(input.aspects).length > 0 && input.aspectCategory !== "";
  const common = { query: input.query, country: input.country, exclude: input.exclude, wantFacets: true };

  // Always both, whatever the Items/Parts toggle says, so the toggle only filters and the counts
  // stay the same when it is switched.
  const calls: { scope: string }[] = hasAspects
    ? [{ scope: input.scope }]
    : [{ scope: VEHICLES_CATEGORY }, { scope: "" }];

  const settled = await Promise.allSettled(
    calls.map((call) =>
      searchEbay({
        ...common,
        limit: hasAspects ? Math.max(input.limit, 100) : input.limit,
        categoryIds: call.scope || undefined,
        ...(hasAspects ? { aspects: input.aspects, aspectCategory: input.aspectCategory } : {}),
      }),
    ),
  );
  const results = settled.map((entry) => (entry.status === "fulfilled" ? entry.value : null));
  if (results.every((entry) => entry === null)) {
    throw (settled.find((entry) => entry.status === "rejected") as PromiseRejectedResult).reason;
  }

  // The same car can come back from both searches, or be listed twice by one seller.
  const seen = new Set<string>();
  const drafts = results
    .flatMap((entry) => entry?.drafts ?? [])
    .filter((draft) => {
      const keys = [draft.id, `${draft.title}|${draft.price}|${draft.seller?.name ?? ""}`.toLowerCase()];
      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    });

  // Facets describe the cars when there are plenty of them, otherwise the general results.
  let facetIndex = 0;
  if (!hasAspects && calls.length > 1) {
    const cars = results[0];
    facetIndex = cars && cars.total >= 15 && cars.facets.length > 0 ? 0 : 1;
  }
  const chosen = results[facetIndex] ?? results.find((entry) => entry !== null) ?? null;
  // The search is for a car or truck when eBay's cars & trucks category has real matches for it
  // (or when the shopper filtered inside that category).
  const vehicleSearch = hasAspects
    ? input.scope === VEHICLES_CATEGORY
    : (results[0]?.total ?? 0) >= VEHICLE_SEARCH_MIN_CARS;

  return {
    drafts,
    vehicleSearch,
    facets: chosen?.facets ?? [],
    facetScope: calls[facetIndex]?.scope ?? "",
    facetCategory: chosen?.categoryId ?? null,
  };
}
