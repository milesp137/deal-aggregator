"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client";
import type { Listing } from "./types";

const STORAGE_KEY = "dealradar:saved";
const MAX_SYNCED = 200;
const SYNC_DEBOUNCE_MS = 800;

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

/** Union by listing id. The device's copy wins for listing details, the older save keeps its date and price. */
function merge(local: SavedListing[], remote: SavedListing[]): SavedListing[] {
  const byId = new Map<string, SavedListing>();
  for (const item of remote) byId.set(item.listing.id, item);
  for (const item of local) {
    const existing = byId.get(item.listing.id);
    byId.set(
      item.listing.id,
      existing && existing.savedAt < item.savedAt
        ? { ...item, savedAt: existing.savedAt, savedPrice: existing.savedPrice }
        : item,
    );
  }
  return [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, MAX_SYNCED);
}

/**
 * A watchlist kept in this browser. When `email` is set (signed in) it is also synced to the
 * account so it follows the user to other devices.
 */
export function useSaved(email: string | null) {
  const [saved, setSaved] = useState<SavedListing[]>([]);
  const synced = useRef(false);

  useEffect(() => {
    setSaved(read());
  }, []);

  // On sign-in, merge what the account already has with what this browser has saved.
  useEffect(() => {
    synced.current = false;
    if (!email) return;
    let cancelled = false;
    api
      .get<{ saved: SavedListing[] }>("/api/saved")
      .then(({ data }) => {
        if (cancelled) return;
        const merged = merge(read(), Array.isArray(data.saved) ? data.saved : []);
        write(merged);
        synced.current = true;
        setSaved(merged);
      })
      .catch(() => undefined); // leave syncing off; the local list keeps working
    return () => {
      cancelled = true;
    };
  }, [email]);

  // Push changes to the account shortly after they happen.
  useEffect(() => {
    if (!email || !synced.current) return;
    const timer = setTimeout(() => {
      api.put("/api/saved", { saved: saved.slice(0, MAX_SYNCED) }).catch(() => undefined);
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [saved, email]);

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
