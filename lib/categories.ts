import type { SourcePlatform } from "./types";

/**
 * What the home page browses when the search box is empty. Each category is a handful of
 * specific searches (generic words like "turbo" or "wheels" pulled in toy cars and kitchen
 * appliances) run on the sites that actually carry that kind of thing.
 */
export interface Category {
  id: string;
  label: string;
  keywords: string[];
  /** Sites searched while browsing this category. A typed search always uses every site. */
  sources: SourcePlatform[];
  /** Rank "stand for PS5"-style listings after the item itself while browsing. */
  demoteMadeFor?: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: "featured",
    label: "Featured",
    keywords: ["240sx", "coilovers", "te37", "rtx 4090"],
    sources: ["Marketplace", "eBay", "Craigs", "BaT"],
  },
  {
    id: "cars",
    label: "Project cars",
    keywords: ["240sx", "miata", "civic si", "supra"],
    sources: ["Marketplace", "Craigs", "BaT", "eBay"],
  },
  {
    id: "parts",
    label: "Performance parts",
    keywords: ["coilovers", "turbo kit", "cat-back exhaust", "limited slip differential"],
    sources: ["Marketplace", "eBay", "Craigs"],
  },
  {
    id: "wheels",
    label: "Wheels",
    keywords: ["te37", "bbs wheels", "enkei", "forged wheels"],
    sources: ["Marketplace", "eBay", "Craigs", "BaT"],
  },
  {
    id: "electronics",
    label: "Electronics",
    keywords: ["rtx 4090", "macbook pro", "iphone 15 pro", "ps5"],
    sources: ["Marketplace", "eBay", "Craigs", "ShopGoodwill"],
    demoteMadeFor: true,
  },
  {
    id: "music",
    label: "Music gear",
    keywords: ["electric guitar", "synthesizer", "tube amp", "guitar pedal"],
    sources: ["Marketplace", "eBay", "Craigs", "Reverb"],
    demoteMadeFor: true,
  },
];

export const DEFAULT_CATEGORY = CATEGORIES[0];

export function categoryById(id: unknown): Category {
  return CATEGORIES.find((category) => category.id === id) ?? DEFAULT_CATEGORY;
}

export const isCategoryId = (value: unknown): value is string =>
  typeof value === "string" && CATEGORIES.some((category) => category.id === value);
