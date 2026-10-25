"use client";

import { useCallback, useEffect, useState } from "react";
import type { Listing } from "./types";

const STORAGE_KEY = "dealradar:saved";

export interface SavedListing {
  listing: Listing;
  savedAt: string;
  /** Price when it was saved; a lower current price means the seller dropped it. */
  savedPrice: number;
}

export type ToggleResult = "saved" | "removed" | "limit";

function read(): SavedListing[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedListing =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SavedListing).listing?.id === "string" &&
        typeof (item as SavedListing).savedPrice === "number",
    );
  } catch {
    return [];
  }
}

function write(items: SavedListing[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage full or unavailable; the in-memory list still works for this visit */
  }
}

/** A per-browser watchlist. Stored locally, so it needs no account. */
export function useSaved() {
  const [saved, setSaved] = useState<SavedListing[]>([]);

  useEffect(() => {
    setSaved(read());
  }, []);

  const isSaved = useCallback((id: string) => saved.some((item) => item.listing.id === id), [saved]);

  const toggle = useCallback(
    (listing: Listing, max: number): ToggleResult => {
      const exists = saved.some((item) => item.listing.id === listing.id);
      if (!exists && saved.length >= max) return "limit";
      const next = exists
        ? saved.filter((item) => item.listing.id !== listing.id)
        : [{ listing, savedAt: new Date().toISOString(), savedPrice: listing.price }, ...saved];
      setSaved(next);
      write(next);
      return exists ? "removed" : "saved";
    },
    [saved],
  );

  /** Refreshes saved snapshots with the latest data for any of them that appear in new results. */
  const refresh = useCallback((fresh: Listing[]) => {
    setSaved((current) => {
      if (current.length === 0) return current;
      const byId = new Map(fresh.map((listing) => [listing.id, listing]));
      let changed = false;
      const next = current.map((item) => {
        const latest = byId.get(item.listing.id);
        if (!latest || (latest.price === item.listing.price && latest.dealScore === item.listing.dealScore)) {
          return item;
        }
        changed = true;
        return { ...item, listing: latest };
      });
      if (!changed) return current;
      write(next);
      return next;
    });
  }, []);

  return { saved, isSaved, toggle, refresh };
}
