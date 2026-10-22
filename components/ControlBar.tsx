"use client";

import type { FormEvent } from "react";
import { Gauge, Loader2, MapPin, Radar, RefreshCw, Search, ShieldOff } from "lucide-react";

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
  } = props;

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
            placeholder="240sx, te37, rtx 4090, coilovers..."
            className="field"
            autoComplete="off"
          />
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
            max={ANY_DISTANCE}
            step={25}
            value={maxDistance}
            onChange={(event) => onMaxDistanceChange(Number(event.target.value))}
            className="h-10 w-full cursor-pointer"
          />
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
          {loading ? "Scraping..." : "Run Live Scrape"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-zinc-300">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => onAutoRefreshChange(event.target.checked)}
            className="h-4 w-4 rounded border-line bg-raised"
          />
          <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "animate-spin text-brand" : ""}`} />
          Auto-scrape every 30s
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
      </div>
    </form>
  );
}
