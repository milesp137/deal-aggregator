/**
 * "Similar listings" price comparison. Comparing every result in a search against one overall
 * median is only fair when the results are all the same kind of thing. For a vague search
 * ("camping gear") a $11 emergency blanket would be measured against $80 stoves and look like a
 * steal. Instead each listing is compared with the listings whose TITLES look most like it
 * (other emergency blankets), which is what "is this a good price?" actually means.
 */

const STOP_WORDS = new Set(
  (
    "the and for with new used free shipping fast from this that your you are was has have not but all any " +
    "one two only just see item items lot set pcs pc pack brand genuine original great good very nice " +
    "condition sale local pickup obo best deal hot size color inch inches mm cm fits fit"
  ).split(" "),
);

/** Words that identify what a listing IS: lowercase words and model codes, minus filler. */
export function titleTokens(title: string, ignore: ReadonlySet<string> = new Set()): Set<string> {
  const tokens = new Set<string>();
  for (const raw of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || ignore.has(raw) || STOP_WORDS.has(raw)) continue;
    // Plain 1-2 digit numbers are quantities and years ("2 pack", "98"), not identity.
    if (/^\d{1,2}$/.test(raw)) continue;
    if (raw.length < 3 && !/\d/.test(raw)) continue;
    // "guitars" and "guitar" are the same word for matching purposes.
    tokens.add(raw.length > 4 && raw.endsWith("s") ? raw.slice(0, -1) : raw);
  }
  return tokens;
}

export function jaccardSets(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface SimilarityItem {
  id: string;
  title: string;
  price: number;
  /** Listings are only compared inside the same group (the same search topic). */
  group: string;
}

/** Fewest close matches before a listing gets its own comparison. */
export const MIN_SIMILAR = 5;
const MAX_SIMILAR = 20;
const MIN_SIMILARITY = 0.2;

/**
 * For each item, the prices of its closest title matches in the same group (excluding itself),
 * best matches first. Items without at least MIN_SIMILAR matches are left out of the result.
 */
export function similarPrices(
  items: SimilarityItem[],
  ignore: ReadonlySet<string> = new Set(),
): Map<string, number[]> {
  const tokens = items.map((item) => titleTokens(item.title, ignore));
  const result = new Map<string, number[]>();

  for (let i = 0; i < items.length; i++) {
    const scored: { similarity: number; price: number }[] = [];
    for (let j = 0; j < items.length; j++) {
      if (i === j || items[i].group !== items[j].group) continue;
      const similarity = jaccardSets(tokens[i], tokens[j]);
      if (similarity >= MIN_SIMILARITY) scored.push({ similarity, price: items[j].price });
    }
    if (scored.length < MIN_SIMILAR) continue;
    scored.sort((a, b) => b.similarity - a.similarity);
    result.set(
      items[i].id,
      scored.slice(0, MAX_SIMILAR).map((entry) => entry.price),
    );
  }
  return result;
}
