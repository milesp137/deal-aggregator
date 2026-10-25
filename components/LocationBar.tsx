"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { searchPlaces, type Place, type UserLocation } from "@/lib/useLocation";

interface LocationBarProps {
  location: UserLocation | null;
  detecting: boolean;
  detectFailed: boolean;
  onDetect: () => void;
  onChoose: (place: Place) => void;
}

export default function LocationBar({
  location,
  detecting,
  detectFailed,
  onDetect,
  onChoose,
}: LocationBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounced place search while the popover is open.
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setSearchError(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError(false);
      searchPlaces(query)
        .then((places) => !cancelled && setResults(places))
        .catch(() => !cancelled && setSearchError(true))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (place: Place) => {
    onChoose(place);
    setOpen(false);
    setQuery("");
  };

  const usingFallback = location?.source === "default";

  return (
    <div ref={rootRef} className="relative mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="inline-flex items-center gap-1.5 text-zinc-300">
        {detecting ? (
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
        ) : (
          <MapPin className="h-4 w-4 text-brand" />
        )}
        {detecting ? (
          "Detecting your location..."
        ) : usingFallback ? (
          <>
            Couldn&apos;t detect your location, showing deals near{" "}
            <strong className="text-white">{location?.label}</strong>
          </>
        ) : (
          <>
            Showing deals near <strong className="text-white">{location?.label}</strong>
          </>
        )}
      </span>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="rounded-lg border border-line bg-raised px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:border-brand hover:text-white"
      >
        {usingFallback ? "Set location" : "Change location"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Change location"
          className="absolute left-0 top-full z-40 mt-2 w-full max-w-sm animate-slide-in rounded-xl border border-line bg-panel p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Change location</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onDetect();
              setOpen(false);
            }}
            className="btn-ghost mb-2 w-full"
          >
            <Crosshair className="h-4 w-4" /> Use my current location
          </button>
          {detectFailed && (
            <p className="mb-2 text-xs text-yellow-300">
              Location access is blocked. Allow it in your browser, or search for a city below.
            </p>
          )}

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="City or ZIP code"
              className="field pl-9"
              autoComplete="off"
            />
          </label>

          <ul className="mt-2 max-h-56 overflow-y-auto">
            {searching && <li className="px-2 py-2 text-xs text-zinc-500">Searching...</li>}
            {searchError && (
              <li className="px-2 py-2 text-xs text-red-400">Search failed. Try again.</li>
            )}
            {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
              <li className="px-2 py-2 text-xs text-zinc-500">No matches. Try a nearby city or ZIP.</li>
            )}
            {results.map((place) => (
              <li key={`${place.label}-${place.lat}-${place.lng}`}>
                <button
                  type="button"
                  onClick={() => pick(place)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
