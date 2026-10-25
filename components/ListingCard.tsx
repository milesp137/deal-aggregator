"use client";

import { useState, type MouseEvent } from "react";
import {
  BellRing,
  ChevronDown,
  Clock,
  Heart,
  MapPin,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { AlertKeyword, Listing } from "@/lib/types";
import { PLATFORM_BADGE, formatDistance, formatPrice, scoreTone, timeAgo } from "@/lib/format";

interface ListingCardProps {
  listing: Listing;
  isNew: boolean;
  matchedAlerts: AlertKeyword[];
  saved: boolean;
  onToggleSave: () => void;
  /** Price when the visitor saved it, if the price has since dropped. */
  priceDropFrom?: number;
}

const REASON_STYLE = {
  good: "text-emerald-300",
  bad: "text-red-300",
  neutral: "text-zinc-300",
} as const;

const REASON_MARK = { good: "+", bad: "\u2212", neutral: "\u2022" } as const;

/** Buttons live inside the card's link, so they must not trigger the navigation. */
const stop = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export default function ListingCard({
  listing,
  isNew,
  matchedAlerts,
  saved,
  onToggleSave,
  priceDropFrom,
}: ListingCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const tone = scoreTone(listing.dealScore);
  const hasAlert = matchedAlerts.length > 0;
  const reasons = listing.scoreReasons ?? [];

  const marketDelta =
    listing.marketMedian !== null
      ? Math.round((listing.price / listing.marketMedian - 1) * 100)
      : null;

  const border = listing.isScam
    ? "border-red-500/50"
    : hasAlert
      ? "border-brand/60 shadow-glow"
      : "border-line hover:border-zinc-600";

  return (
    <a
      href={listing.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-left no-underline"
    >
      <article
        className={`group flex animate-slide-in flex-col overflow-hidden rounded-2xl border bg-panel transition ${border}`}
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-raised">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${
              listing.isScam ? "opacity-50 grayscale" : ""
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

          <span
            className={`absolute left-3 top-3 rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide ${PLATFORM_BADGE[listing.sourcePlatform]}`}
          >
            {listing.sourcePlatform}
          </span>

          <span
            title={tone.label}
            className={`absolute right-3 top-3 rounded-full px-3 py-1 text-sm font-bold backdrop-blur ${tone.badge}`}
          >
            {listing.dealScore}
            <span className="text-xs font-semibold opacity-70">/10</span>
          </span>

          <button
            type="button"
            aria-label={saved ? "Remove from saved" : "Save listing"}
            aria-pressed={saved}
            title={saved ? "Remove from saved" : "Save to watch this listing"}
            onClick={(event) => {
              stop(event);
              onToggleSave();
            }}
            className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/55 backdrop-blur transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
          >
            <Heart className={`h-4 w-4 ${saved ? "fill-red-500 text-red-500" : "text-white"}`} />
          </button>

          <div className="absolute bottom-3 left-3 flex gap-2">
            {isNew && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold uppercase text-black">
                <Sparkles className="h-3 w-3" /> New
              </span>
            )}
            {listing.isSample && (
              <span
                title="Built-in sample data, not a real post. The link opens a search on the platform."
                className="inline-flex items-center rounded-md bg-zinc-800/90 px-2 py-1 text-[11px] font-bold uppercase text-zinc-300"
              >
                Sample
              </span>
            )}
            {hasAlert && (
              <span
                title={`Matches: ${matchedAlerts.map((alert) => alert.keyword).join(", ")}`}
                className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[11px] font-bold uppercase text-white"
              >
                <BellRing className="h-3 w-3" /> Alert
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                {formatPrice(listing.price)}
              </p>
              {priceDropFrom !== undefined && priceDropFrom > listing.price && (
                <p className="mt-0.5 text-xs font-semibold text-emerald-400">
                  Price drop: was {formatPrice(priceDropFrom)} when you saved it
                </p>
              )}
            </div>
            {marketDelta !== null && (
              <p
                className={`flex shrink-0 items-center gap-1 pb-1 text-xs font-semibold ${
                  marketDelta <= 0 ? "text-emerald-400" : "text-red-400"
                }`}
                title={`Typical price ${formatPrice(listing.marketMedian ?? 0)}`}
              >
                {marketDelta <= 0 ? (
                  <TrendingDown className="h-3.5 w-3.5" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5" />
                )}
                {Math.abs(marketDelta)}% {marketDelta <= 0 ? "below" : "above"} typical
              </p>
            )}
          </div>

          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-zinc-100 group-hover:text-brand transition-colors">
            {listing.title}
          </h3>

          {listing.isScam && listing.scamReasoning && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/60 bg-red-950/60 p-3 text-sm text-red-200"
            >
              <p className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wide text-red-400">
                <ShieldAlert className="h-4 w-4" /> Likely scam
              </p>
              <p className="leading-snug">{listing.scamReasoning}</p>
            </div>
          )}

          {listing.description && (
            <p className="line-clamp-3 text-sm leading-relaxed text-zinc-400">{listing.description}</p>
          )}

          {reasons.length > 0 && (
            <div>
              <button
                type="button"
                aria-expanded={showWhy}
                onClick={(event) => {
                  stop(event);
                  setShowWhy((open) => !open);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Why {listing.dealScore}/10?
                <ChevronDown className={`h-3.5 w-3.5 transition ${showWhy ? "rotate-180" : ""}`} />
              </button>
              {showWhy && (
                <ul className="mt-2 space-y-1.5 rounded-lg border border-line bg-canvas/50 p-3 text-xs leading-snug">
                  {reasons.map((reason, index) => (
                    <li key={index} className={`flex gap-2 ${REASON_STYLE[reason.tone]}`}>
                      <span className="w-3 shrink-0 text-center font-bold">{REASON_MARK[reason.tone]}</span>
                      <span>{reason.text}</span>
                    </li>
                  ))}
                  <li className="border-t border-line pt-1.5 text-zinc-500">
                    Scores compare each price to similar listings found in this search, then adjust for
                    condition, freshness and distance.
                  </li>
                </ul>
              )}
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {listing.location}
              {listing.distanceMiles !== null && <> &middot; {formatDistance(listing.distanceMiles)}</>}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {timeAgo(listing.timestamp)}
            </span>
          </div>
        </div>
      </article>
    </a>
  );
}
