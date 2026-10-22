import type { SourcePlatform } from "./types";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return usd.format(value);
}

export function formatDistance(miles: number): string {
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles).toLocaleString("en-US")} mi`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface ScoreTone {
  label: string;
  badge: string;
}

/** Green = 8-10, Yellow = 5-7, Red = 1-4. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 8) {
    return {
      label: "Hot deal",
      badge: "bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-400/60",
    };
  }
  if (score >= 5) {
    return {
      label: "Fair deal",
      badge: "bg-yellow-500/20 text-yellow-300 ring-1 ring-inset ring-yellow-400/60",
    };
  }
  return {
    label: "Overpriced",
    badge: "bg-red-500/20 text-red-300 ring-1 ring-inset ring-red-400/60",
  };
}

export const PLATFORM_BADGE: Record<SourcePlatform, string> = {
  eBay: "bg-yellow-400 text-black",
  Marketplace: "bg-blue-500 text-white",
  Craigs: "bg-purple-500 text-white",
};
