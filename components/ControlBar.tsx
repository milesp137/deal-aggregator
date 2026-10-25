"use client";

import type { FormEvent } from "react";
import { Check, Gauge, Lightbulb, Loader2, Lock, MapPin, Radar, RefreshCw, Search, ShieldOff } from "lucide-react";
import { FREE_MAX_DISTANCE, type UpgradeReason } from "@/lib/plan";
import { ALL_SOURCES, SORT_LABELS, SOURCE_NAMES, type SortMode, type SourcePlatform } from "@/lib/types";

export const ANY_DISTANCE = 1500;

interface ControlBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  maxDistance: number;
  onMaxDistanceChange: (value: number) => void;
  minScore: number;
  onMinScoreChange: (value: number) => void;
  hideScams: boolean;
  onHideScamsChange: (value: boolean) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  loading: boolean;
  onRun: () => void;
  isPro: boolean;
  onProRequired: (reason: UpgradeReason) => void;
  /** Platforms currently being searched. */
  sources: SourcePlatform[];
  onSourcesChange: (sources: SourcePlatform[]) => void;
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
  /** Price range as typed ("" = no limit). */
  minPrice: string;
  maxPrice: string;
  onPriceChange: (minPrice: string, maxPrice: string) => void;
  /** Listings found per site in the latest search; null before the first result. */
  sourceCounts: Record<SourcePlatform, number> | null;
  recent: string[];
  onPickRecent: (query: string) => void;
  onClearRecent: () => void;
}

export default function ControlBar(props: ControlBarProps) {
  const {
    query,
    onQueryChange,
    maxDistance,
    onMaxDistanceChange,
    minScore,
    onMinScoreChange,
    hideScams,
    onHideScamsChange,
    autoRefresh,
    onAutoRefreshChange,
    loading,
    onRun,
    isPro,
    onProRequired,
    sources,
    onSourcesChange,
    sort,
    onSortChange,
    minPrice,
    maxPrice,
    onPriceChange,
    sourceCounts,
    recent,
    onPickRecent,
    onClearRecent,
  } = props;

  /** Digits only, so a stray letter or minus sign can't break the search. */
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 7);

  const toggleSource = (source: SourcePlatform) => {
    if (sources.includes(source)) {
      // At least one site must stay on, otherwise there is nothing to search.
      if (sources.length === 1) return;
      onSourcesChange(sources.filter((item) => item !== source));
    } else {
      onSourcesChange(ALL_SOURCES.filter((item) => item === source || sources.includes(item)));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onRun();
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-line bg-panel/90 p-4 shadow-xl backdrop-blur sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <Search className="h-3.5 w-3.5" /> Keyword search
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Try 240sx, te37, rtx 4090, coilovers..."
            className="field"
            autoComplete="off"
          />
          {!query.trim() ? (
            <span className="mt-1.5 block text-xs text-zinc-500">
              Leave blank to browse 240sx, coilovers, turbo &amp; wheels
            </span>
          ) : (
            <span className="mt-1.5 flex items-start gap-1 text-xs text-zinc-500">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
              <span>
                <strong className="font-semibold text-zinc-300">Tip:</strong> Be precise about what
                you&apos;re looking up!
                {query.trim().split(/\s+/).length === 1 &&
                  ` A broad search like “${query.trim()}” also matches games, cases and parts. Add what you want, like “${query.trim()} console”.`}
              </span>
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Max distance
            </span>
            <span className="text-sm normal-case tracking-normal text-white">
              {maxDistance >= ANY_DISTANCE ? "Any" : `${maxDistance} mi`}
            </span>
          </span>
          <input
            type="range"
            min={25}
            max={isPro ? ANY_DISTANCE : FREE_MAX_DISTANCE}
            step={25}
            value={Math.min(maxDistance, isPro ? ANY_DISTANCE : FREE_MAX_DISTANCE)}
            onChange={(event) => onMaxDistanceChange(Number(event.target.value))}
            className="h-8 w-full cursor-pointer"
          />
          {!isPro && (
            <button
              type="button"
              onClick={() => onProRequired("distance")}
              className="-mt-1 inline-flex items-center gap-1 text-xs font-semibold text-orange-300 hover:text-orange-200"
            >
              <Lock className="h-3 w-3" /> Pro: search beyond {FREE_MAX_DISTANCE} miles
            </button>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" /> Min deal score
            </span>
            <span className="text-sm normal-case tracking-normal text-white">{minScore} / 10</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={minScore}
            onChange={(event) => onMinScoreChange(Number(event.target.value))}
            className="h-10 w-full cursor-pointer"
          />
        </label>

        <button type="submit" disabled={loading} className="btn-primary h-[42px] w-full lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {recent.length > 0 && !query.trim() && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-zinc-500">Recent</span>
          {recent.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onPickRecent(item)}
              className="rounded-full border border-line bg-raised px-2.5 py-1 font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            onClick={onClearRecent}
            className="text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-zinc-300">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Search on</span>
        {ALL_SOURCES.map((source) => {
          const active = sources.includes(source);
          return (
            <button
              key={source}
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => toggleSource(source)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                active
                  ? "border-orange-400/60 bg-orange-500/15 text-orange-200"
                  : "border-line bg-raised text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {active ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
              {SOURCE_NAMES[source]}
              {active && sourceCounts && (
                <span className="rounded-full bg-black/30 px-1.5 text-[10px] tabular-nums">
                  {sourceCounts[source]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-300">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoRefresh && isPro}
            onChange={(event) => {
              if (!isPro) {
                onProRequired("live");
                return;
              }
              onAutoRefreshChange(event.target.checked);
            }}
            className="h-4 w-4 rounded border-line bg-raised"
          />
          <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh && isPro ? "animate-spin text-brand" : ""}`} />
          Auto-refresh every 30s
          {!isPro && (
            <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-300">
              <Lock className="h-3 w-3" /> Pro
            </span>
          )}
        </label>

        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={hideScams}
            onChange={(event) => onHideScamsChange(event.target.checked)}
            className="h-4 w-4 rounded border-line bg-raised"
          />
          <ShieldOff className="h-3.5 w-3.5" />
          Hide suspected scams
        </label>

        <div className="inline-flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Price</span>
          <input
            inputMode="numeric"
            aria-label="Minimum price"
            placeholder="Min $"
            value={minPrice}
            onChange={(event) => onPriceChange(digits(event.target.value), maxPrice)}
            className="field !w-24 !py-1.5 text-sm"
          />
          <span className="text-zinc-500">to</span>
          <input
            inputMode="numeric"
            aria-label="Maximum price"
            placeholder="Max $"
            value={maxPrice}
            onChange={(event) => onPriceChange(minPrice, digits(event.target.value))}
            className="field !w-24 !py-1.5 text-sm"
          />
        </div>

        <label className="inline-flex items-center gap-2 sm:ml-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Sort</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortMode)}
            className="field !w-auto !py-1.5 text-sm"
          >
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {SORT_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
