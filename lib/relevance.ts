/**
 * Search intent helpers. A broad query like "psp" matches thousands of games, cases and chargers
 * that happen to have "psp" in the title. These heuristics spot listings that are probably an
 * accessory, software or junk rather than the thing itself, so they can be pushed down (or hidden
 * when there are plenty of better results). The title is the only signal available on every site.
 *
 * Nothing here is ever applied to blank searches, and a term the shopper typed is never held
 * against a listing: searching "psp games" keeps games, "psp case" keeps cases.
 */

/** Accessories and software. A title that also says console/system/handheld is left alone. */
const ACCESSORY_TERMS = [
  "games?",
  "cartridges?",
  "cases?",
  "covers?",
  "chargers?",
  "cables?",
  "adapters?",
  "batter(?:y|ies)",
  "screen protectors?",
  "tempered glass",
  "protectors?",
  "skins?",
  "stickers?",
  "decals?",
  "manuals?",
  "box only",
  "empty box",
  "styluses|stylus",
  "memory cards?",
  "faceplates?",
  "shells?",
  "housing",
  "mod kits?",
  "mod ?chips?",
  "controllers?",
  "headsets?",
  "pouch",
  "carrying",
  "replacement",
];

/**
 * Things that carry a product's name without being the product: video games, books, records,
 * clothing and toys ("Guitar Hero III" disc, "Encyclopedia of Guitars", a Hot Wheels car) plus
 * small parts and accessories for instruments. Always junk, even when the title says "system".
 */
const MEDIA_AND_MERCH_TERMS = [
  "disc only",
  "steel ?books?",
  "dvds?",
  "blu-?rays?",
  "albums?",
  "encyclopedia",
  "paperback",
  "hardcover",
  "magazines?",
  "posters?",
  "sheet music",
  "lessons?",
  "t-?shirts?",
  "hoodies?",
  "costumes?",
  "toys?",
  "lego",
  "funko",
  "ornaments?",
  "keychains?",
  "patches",
  "hot wheels",
  "diecast",
  "die-cast",
  // instrument bits (plural only: "6 string guitar" and "pick up only" are not junk)
  "(?<!\\d[ -])strings",
  "picks",
  "capos?",
  "saddles?",
  "tuning pegs?",
  "hangers?",
  "pickup rings?",
  "mounting rings?",
  "pick ?guards?",
  "scratch ?plates?",
  "stands?",
  "straps?",
  "tuning machines?",
  "machine heads?",
  "(?:strat|stratocaster|tele|telecaster|lp|les paul) (?:body|neck)",
  "(?:body|neck) only",
  "bodies",
];

/** Condition problems: unwanted for deal hunting even when the title says "console". */
const CONDITION_TERMS = ["for parts", "parts only", "not working", "broken", "cracked screen"];

const ACCESSORY = new RegExp(`\\b(?:${ACCESSORY_TERMS.join("|")})\\b`, "i");
const CONDITION = new RegExp(`\\b(?:${CONDITION_TERMS.join("|")})\\b`, "i");
const WITH_EXTRAS = /\bwith\b|\bw\/|\bincludes?\b|\bincluding\b|\bplus\b|\+/i;
const MEDIA_AND_MERCH = new RegExp(`\\b(?:${MEDIA_AND_MERCH_TERMS.join("|")})\\b`, "i");
const PROTECTED = /\b(?:console|system|handheld)\b/i;
/** "Screen protector FOR psp": the thing being searched is only what the item is made for. */
const FOR_WORD = /\bfor\b(?!\s+(?:sale|trade|parts|repair|only))/i;

function termsOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Removes the words the shopper typed, so they are not counted against a listing. */
function withoutQueryTerms(title: string, terms: string[]): string {
  let text = title;
  for (const term of terms) {
    if (term.length < 2) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }
  return text;
}

/**
 * How a listing relates to what was searched for:
 *  - "junk":     accessory, software or a broken unit. Ranked last, and hidden when there are
 *                plenty of better results.
 *  - "made-for": "<something> FOR <the search>" (a case for a PSP, coilovers for a 240sx). Ranked
 *                after the item itself but never hidden, since these can be exactly what the
 *                shopper wants (parts).
 *  - null:       looks like the item itself.
 */
export type Relevance = "junk" | "made-for" | null;

export function classifyTitle(title: string, query: string): Relevance {
  const terms = termsOf(query);
  if (terms.length === 0) return null;

  // Compare only the words the shopper did NOT type.
  const rest = withoutQueryTerms(title, terms);

  if (CONDITION.test(rest)) return "junk";

  // Extras mentioned after "with" ("guitar with case and strap", "PSP with 10 games") are bonuses
  // that come WITH the item, not what the listing is; only the part before them counts.
  const main = rest.split(WITH_EXTRAS)[0];
  if (MEDIA_AND_MERCH.test(main)) return "junk";
  if (ACCESSORY.test(main) && !PROTECTED.test(title)) return "junk";

  if (!terms.includes("for")) {
    const lower = title.toLowerCase();
    const forMatch = FOR_WORD.exec(lower);
    if (forMatch && forMatch.index > 0) {
      const firstTerm = Math.min(
        ...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0),
        Number.POSITIVE_INFINITY,
      );
      if (forMatch.index < firstTerm) return "made-for";
    }
  }
  return null;
}

/** Junk is only hidden when at least this many better results exist; otherwise it stays, last. */
export const MIN_ON_TARGET_TO_HIDE = 6;
