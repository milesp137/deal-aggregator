import { BellRing, Clock, MapPin, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { AlertKeyword, Listing } from "@/lib/types";
import { PLATFORM_BADGE, formatDistance, formatPrice, scoreTone, timeAgo } from "@/lib/format";

interface ListingCardProps {
  listing: Listing;
  isNew: boolean;
  matchedAlerts: AlertKeyword[];
}

export default function ListingCard({ listing, isNew, matchedAlerts }: ListingCardProps) {
  const tone = scoreTone(listing.dealScore);
  const hasAlert = matchedAlerts.length > 0;

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

          <div className="absolute bottom-3 left-3 flex gap-2">
            {isNew && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold uppercase text-black">
                <Sparkles className="h-3 w-3" /> New
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
            <p className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {formatPrice(listing.price)}
            </p>
            {marketDelta !== null && (
              <p
                className={`flex shrink-0 items-center gap-1 pb-1 text-xs font-semibold ${
                  marketDelta <= 0 ? "text-emerald-400" : "text-red-400"
                }`}
                title={`Market median ${formatPrice(listing.marketMedian ?? 0)}`}
              >
                {marketDelta <= 0 ? (
                  <TrendingDown className="h-3.5 w-3.5" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5" />
                )}
                {Math.abs(marketDelta)}% {marketDelta <= 0 ? "below" : "above"} market
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

          <p className="line-clamp-3 text-sm leading-relaxed text-zinc-400">{listing.description}</p>

          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {listing.location} &middot; {formatDistance(listing.distanceMiles)}
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