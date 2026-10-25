"use client";

import { Check, Info, SlidersHorizontal, X } from "lucide-react";
import type { ResultKind, ScrapeMeta } from "@/lib/types";

interface ResultFiltersProps {
  /** What is typed in the search box. */
  query: string;
  meta: ScrapeMeta | null;
  kind: ResultKind;
  /** Filters picked from the lists (as opposed to ones spotted in the typed words). */
  picked: Record<string, string>;
  onKindChange: (kind: ResultKind) => void;
  /** Pick (or, with value null, clear) one of eBay's filters such as Transmission or Platform. */
  onPickFacet: (name: string, value: string | null) => void;
  /** Switch off a filter that came from words in the search box ("in manual"). */
  onRemovePhrase: (phrase: string) => void;
}

const KINDS: { id: ResultKind; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "items", label: "The item itself" },
  { id: "parts", label: "Parts, models & accessories" },
];

/** Filters with more choices than this become a menu instead of chips. */
const LONG_LIST = 10;

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300";

/**
 * Controls that appear under a search: the Items / Parts toggle, filters spotted in the typed
 * words ("manual", "ps3", "1999"), and eBay's own filters for the results.
 */
export default function ResultFilters({
  query,
  meta,
  kind,
  picked,
  onKindChange,
  onPickFacet,
  onRemovePhrase,
}: ResultFiltersProps) {
  const typed = query.trim();
  if (typed === "" || !meta || meta.query.trim().toLowerCase() !== typed.toLowerCase()) return null;

  const { kindCounts, autoFilters, facets, activeAspects } = meta;
  const showKinds = kind !== "all" || (kindCounts.items > 0 && kindCounts.parts > 0);
  const activeEntries = Object.entries(picked);
  // Filters that came from the typed words already show as chips of their own, so only the
  // picked ones and the still-unused ones are offered as choices.
  const choices = facets.filter(
    (facet) => facet.name in picked || (!(facet.name in (activeAspects ?? {})) && facet.values.length > 0),
  );

  if (!showKinds && autoFilters.length === 0 && choices.length === 0 && activeEntries.length === 0) return null;

  return (
    <div className="space-y-2.5" aria-label="Filter these results">
      {showKinds && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Show
          </span>
          <div role="group" aria-label="Items or parts" className="inline-flex rounded-full border border-line bg-raised p-0.5">
            {KINDS.map((option) => {
              const active = option.id === kind;
              const count =
                option.id === "items" ? kindCounts.items : option.id === "parts" ? kindCounts.parts : null;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onKindChange(option.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                    active ? "bg-orange-500 text-white" : "text-zinc-300 hover:text-white"
                  }`}
                >
                  {option.label}
                  {count !== null && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                        active ? "bg-black/25 text-white" : "bg-black/30 text-zinc-400"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(autoFilters.length > 0 || activeEntries.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Filtering by</span>
          {autoFilters.map((filter) => (
            <button
              key={filter.phrase}
              type="button"
              onClick={() => onRemovePhrase(filter.phrase)}
              title={`Remove "${filter.phrase}" from the search`}
              className={`${chip} ${
                filter.noMatches
                  ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-200"
                  : "border-orange-400/60 bg-orange-500/15 text-orange-200"
              }`}
            >
              {filter.label}
              {filter.noMatches && <span className="font-normal opacity-80">(none found on eBay)</span>}
              <X className="h-3 w-3" />
            </button>
          ))}
          {activeEntries.map(([name, value]) => (
            <button
              key={name}
              type="button"
              onClick={() => onPickFacet(name, null)}
              title={`Clear ${name}`}
              className={`${chip} border-orange-400/60 bg-orange-500/15 text-orange-200`}
            >
              {name}: {value}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {choices.map((facet) => (
        <div key={facet.name} className="flex flex-wrap items-center gap-2">
          <span className="mr-1 min-w-[5.5rem] text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {facet.name}
          </span>
          {facet.values.length > LONG_LIST ? (
            // Years of a car run back decades: a menu beats forty chips.
            <select
              aria-label={facet.name}
              value={picked[facet.name] ?? ""}
              onChange={(event) => onPickFacet(facet.name, event.target.value || null)}
              className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              <option value="">Any ({facet.values.length} to choose from)</option>
              {facet.values.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                  {item.count > 0 ? ` (${item.count})` : ""}
                </option>
              ))}
            </select>
          ) : (
            facet.values.map((item) => {
            const active = activeAspects?.[facet.name] === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => onPickFacet(facet.name, active ? null : item.value)}
                className={`${chip} ${
                  active
                    ? "border-orange-400/60 bg-orange-500/15 text-orange-200"
                    : "border-line bg-raised text-zinc-200 hover:border-orange-400/60 hover:text-white"
                }`}
              >
                {active && <Check className="h-3 w-3" />}
                {item.value}
                {item.count > 0 && (
                  <span className="rounded-full bg-black/30 px-1.5 text-[10px] tabular-nums text-zinc-400">
                    {item.count}
                  </span>
                )}
              </button>
            );
            })
          )}
        </div>
      ))}

      {meta.filtersLimitedToEbay && (
        <p className="flex items-start gap-1.5 text-xs text-zinc-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          These filters come from eBay, so only eBay listings are shown. Clear them to see every site again.
        </p>
      )}
    </div>
  );
}
