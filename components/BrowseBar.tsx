"use client";

import { Compass, ListFilter } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import type { ScrapeMeta } from "@/lib/types";

interface BrowseBarProps {
  /** What is typed in the search box. */
  query: string;
  category: string;
  onCategoryChange: (id: string) => void;
  /** The results currently on screen, to know which search the suggestions belong to. */
  meta: ScrapeMeta | null;
  /** Runs a search (used when a suggestion is clicked). */
  onPick: (query: string) => void;
}

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300";

/**
 * One line under the search box that adapts: with an empty box it offers categories to browse;
 * after a broad search it offers ways to narrow it down.
 */
export default function BrowseBar({ query, category, onCategoryChange, meta, onPick }: BrowseBarProps) {
  const typed = query.trim();

  if (typed === "") {
    return (
      <div className="flex flex-wrap items-center gap-2" aria-label="Browse by category">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Compass className="h-3.5 w-3.5" /> Browse
        </span>
        {CATEGORIES.map((item) => {
          const active = item.id === category;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onCategoryChange(item.id)}
              className={`${chip} ${
                active
                  ? "border-orange-400/60 bg-orange-500/15 text-orange-200"
                  : "border-line bg-raised text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Only suggest for the search the results actually belong to.
  const suggestions = meta && meta.query.trim().toLowerCase() === typed.toLowerCase() ? meta.suggestions : [];
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Narrow your search">
      <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <ListFilter className="h-3.5 w-3.5" /> Narrow it down
      </span>
      {suggestions.map((item) => (
        <button
          key={item.query}
          type="button"
          onClick={() => onPick(item.query)}
          title={`Search "${item.query}"`}
          className={`${chip} border-line bg-raised text-zinc-200 hover:border-orange-400/60 hover:text-white`}
        >
          {item.label}
          <span className="rounded-full bg-black/30 px-1.5 text-[10px] tabular-nums text-zinc-400">{item.count}</span>
        </button>
      ))}
    </div>
  );
}
