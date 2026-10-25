"use client";

import { useEffect } from "react";

const STORAGE_KEY = "dealradar:prefs";
const RECENT_KEY = "dealradar:recent";
const MAX_RECENT = 6;

export function loadPrefs<T extends object>(): Partial<T> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

/** Saves the visitor's filter choices so the site is the way they left it next time. */
export function usePersistPrefs(prefs: object, enabled: boolean): void {
  const json = JSON.stringify(prefs);
  useEffect(() => {
    // Skip until the saved values have been loaded, or we'd overwrite them with defaults.
    if (!enabled) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
    } catch {
      /* ignore */
    }
  }, [json, enabled]);
}

export function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

/** Puts `query` first in the recent-search list (case-insensitive, no duplicates). */
export function addRecent(query: string): string[] {
  const trimmed = query.trim();
  const current = loadRecent();
  if (!trimmed) return current;
  const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT,
  );
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearRecent(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
