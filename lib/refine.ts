/**
 * "Narrow it down" suggestions for a broad search. A search like "guitar" mixes electric,
 * acoustic and bass guitars with pedals and amps, so the shopper needs a way to say which one.
 * Suggestions come from the results themselves: the words that most often sit next to the search
 * term in listing titles ("electric guitar", "acoustic guitar", "guitar pedal") plus other
 * frequent words such as brands. Nothing is hand-written per product.
 */

export interface Suggestion {
  /** Text shown on the chip. */
  label: string;
  /** The search that runs when the chip is clicked. */
  query: string;
  /** How many of the listings mention it. */
  count: number;
}

const STOP_WORDS = new Set(
  (
    "the and for with new used free shipping fast from this that your you are was has have not but all any one two " +
    "out only just see pics pic photo photos item items lot lots set sets pair pcs pc pack brand genuine " +
    "original authentic great good very nice excellent mint condition like works working tested untested read " +
    "description sale sell selling local pickup pick up obo firm price negotiable make offer best deal hot rare " +
    "assorted various multiple different size sizes color colors black white " +
    "red blue green silver gold grey gray usa us united states inch inches mm cm ft each per fits fit fitting " +
    "compatible replacement upgrade complete full left right front rear top bottom side high low " +
    "who what when where how why can will may inc ltd co week weeks day days today now"
  ).split(" "),
);

const MAX_SUGGESTIONS = 10;
const MIN_LISTINGS = 8;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&amp;/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/(^|\s)-+|-+(\s|$)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const isYear = (token: string) => /^(19[5-9]\d|20[0-3]\d)$/.test(token);
const isWord = (token: string) => /^[a-z][a-z0-9-]{2,}$/.test(token) && !STOP_WORDS.has(token);
/** Model-style numbers that read well after a product name ("iphone 15", "rtx 4090"). */
const isModelNumber = (token: string) => /^\d{2,4}$/.test(token) && !isYear(token);

/** "guitars" for the query "guitar" is the same search, not a refinement. */
function isQueryVariant(token: string, queryTokens: string[]): boolean {
  return queryTokens.some((q) => token === `${q}s` || token === `${q}es` || q === `${token}s`);
}

function indexOfSequence(tokens: string[], sequence: string[]): number {
  if (sequence.length === 0) return -1;
  outer: for (let i = 0; i + sequence.length <= tokens.length; i++) {
    for (let j = 0; j < sequence.length; j++) {
      if (tokens[i + j] !== sequence[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export function suggestRefinements(titles: string[], query: string): Suggestion[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || titles.length < MIN_LISTINGS) return [];
  const queryText = queryTokens.join(" ");
  const inQuery = new Set(queryTokens);

  const phrases = new Map<string, { label: string; query: string; count: number }>();
  const words = new Map<string, number>();
  const bump = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);

  const wordTitles = new Map<string, Set<number>>();
  for (const [titleIndex, title] of titles.entries()) {
    const tokens = tokenize(title);
    const seenPhrases = new Set<string>();

    const at = indexOfSequence(tokens, queryTokens);
    if (at >= 0) {
      const before = tokens[at - 1];
      const after = tokens[at + queryTokens.length];
      if (before && isWord(before) && !inQuery.has(before)) seenPhrases.add(`${before} ${queryText}`);
      if (after && (isWord(after) || isModelNumber(after)) && !inQuery.has(after)) {
        seenPhrases.add(`${queryText} ${after}`);
      }
    }
    for (const phrase of seenPhrases) {
      const entry = phrases.get(phrase) ?? { label: phrase, query: phrase, count: 0 };
      entry.count += 1;
      phrases.set(phrase, entry);
    }

    for (const token of new Set(tokens)) {
      if (!isWord(token) || inQuery.has(token) || isQueryVariant(token, queryTokens)) continue;
      bump(words, token);
      const where = wordTitles.get(token) ?? new Set<number>();
      where.add(titleIndex);
      wordTitles.set(token, where);
    }
  }

  const minPhrase = 2;
  const chosen: Suggestion[] = [...phrases.values()]
    .filter((entry) => entry.count >= minPhrase && entry.count < titles.length * 0.9)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Frequent single words (mostly brands and models) that aren't already part of a phrase above.
  const inPhrases = new Set(chosen.flatMap((entry) => entry.label.split(" ")));
  const minWord = Math.max(3, Math.ceil(titles.length * 0.08));
  const extras: Suggestion[] = [];
  const keptWords: Set<number>[] = [];
  const candidates = [...words.entries()]
    .filter(([word, count]) => count >= minWord && count <= titles.length * 0.7 && !inPhrases.has(word))
    .sort((a, b) => b[1] - a[1]);
  for (const [word, count] of candidates) {
    const where = wordTitles.get(word) ?? new Set<number>();
    // Skip words that only ever appear in the same listings as a word already suggested
    // (several copies of one listing would otherwise yield "taylor", "mini", "vets"...).
    const overlapsKept = keptWords.some((kept) => {
      let shared = 0;
      for (const index of where) if (kept.has(index)) shared++;
      return shared / where.size >= 0.8;
    });
    if (overlapsKept) continue;
    keptWords.push(where);
    extras.push({ label: word, query: `${query.trim()} ${word}`, count });
  }

  return [...chosen, ...extras].slice(0, MAX_SUGGESTIONS);
}
