/**
 * Turns words typed into the search box into real filters. "jeep cherokee in manual" means
 * manual TRANSMISSION, not a manual (book), and "call of duty ps3" means games that run on a
 * PS3. A word is only treated as a filter after eBay confirms the search has that kind of filter
 * (Transmission, Platform, Model Year...); otherwise it stays an ordinary search word.
 */

export interface TypedFilter {
  id: string;
  /** Matches the name of eBay's filter, e.g. /^transmission$/. */
  aspect: RegExp;
  /** Matches the filter's value in eBay's list, e.g. /manual/i. */
  value: RegExp;
  /** What the chip says. */
  label: string;
  /** The text found in the search box, so it can be removed from it. */
  phrase: string;
  /** Plain-text test for sites with no filters of their own (Craigslist): title + description. */
  text: RegExp;
  /** Only makes sense for vehicles, so the Cars & Trucks category is probed first. */
  vehicle: boolean;
}

interface Rule {
  id: string;
  /** Finds the words in the search. Must not use the g flag. */
  find: RegExp;
  aspect: RegExp;
  value: (match: RegExpMatchArray) => RegExp;
  label: (match: RegExpMatchArray) => string;
  text: (match: RegExpMatchArray) => RegExp;
  vehicle: boolean;
}

const RULES: Rule[] = [
  {
    id: "manual",
    // "manual" the book is never a transmission: owners/service/repair manual, manual transmission.
    find: /(?<!\b(?:owners?|owner'?s|service|repair|shop|user|instruction|factory|workshop)\s)\b(?:manual|stick(?:\s?shift)?|[3-7][\s-]?speed|[3-7]\s?spd)\b(?!\s+(?:transmission|trans|gearbox|book|guide|handbook|linkage|shifter|cable))/i,
    aspect: /^transmission$/i,
    value: () => /manual/i,
    label: () => "Manual transmission",
    text: () => /\b(?:manual|stick\s?shift|[3-7][\s-]?speed|[3-7]\s?spd|[3-7]mt)\b/i,
    vehicle: true,
  },
  {
    id: "automatic",
    find: /\bautomatic\b/i,
    aspect: /^transmission$/i,
    value: () => /automatic/i,
    label: () => "Automatic transmission",
    text: () => /\bautomatic\b|\bauto trans\b/i,
    vehicle: true,
  },
  {
    id: "4wd",
    find: /\b(?:4x4|4wd|four wheel drive)\b/i,
    aspect: /^drive type$/i,
    value: () => /^4wd$/i,
    label: () => "4WD",
    text: () => /\b(?:4x4|4wd|four wheel drive)\b/i,
    vehicle: true,
  },
  {
    id: "awd",
    find: /\bawd\b/i,
    aspect: /^drive type$/i,
    value: () => /^awd$/i,
    label: () => "AWD",
    text: () => /\bawd\b/i,
    vehicle: true,
  },
  {
    id: "year",
    find: /\b(19[5-9]\d|20[0-3]\d)\b/,
    aspect: /^(model )?year$/i,
    value: (match) => new RegExp(`^${match[1]}$`),
    label: (match) => `Year ${match[1]}`,
    text: (match) => new RegExp(`\\b${match[1]}\\b`),
    vehicle: true,
  },
  ...(
    [
      ["ps2", /\bps2\b|\bplaystation 2\b/i, /playstation 2\b/i, "PS2"],
      ["ps3", /\bps3\b|\bplaystation 3\b/i, /playstation 3\b/i, "PS3"],
      ["ps4", /\bps4\b|\bplaystation 4\b/i, /playstation 4\b/i, "PS4"],
      ["ps5", /\bps5\b|\bplaystation 5\b/i, /playstation 5\b/i, "PS5"],
      ["xbox360", /\bxbox 360\b|\bx360\b/i, /xbox 360\b/i, "Xbox 360"],
      ["xboxone", /\bxbox one\b/i, /xbox one\b/i, "Xbox One"],
      ["switch", /\bnintendo switch\b/i, /nintendo switch\b/i, "Nintendo Switch"],
      ["wiiu", /\bwii u\b/i, /wii u\b/i, "Wii U"],
      ["wii", /\bwii\b(?!\s*u\b)/i, /nintendo wii$|^wii$|nintendo wii\b(?! u)/i, "Wii"],
      ["n64", /\bn64\b|\bnintendo 64\b/i, /nintendo 64\b/i, "Nintendo 64"],
    ] as const
  ).map(
    ([id, find, value, label]): Rule => ({
      id,
      find,
      aspect: /^platform$/i,
      value: () => value,
      label: () => label,
      text: () => find,
      vehicle: false,
    }),
  ),
];

/** Words that introduce a filter ("in manual", "with 4x4") and go away with it. */
const LEAD_WORDS = "(?:in|with|only|a|an)";

export interface ParsedQuery {
  /** The search with the filter words taken out. */
  query: string;
  filters: TypedFilter[];
}

export function parseTypedFilters(query: string): ParsedQuery {
  let remaining = query;
  const filters: TypedFilter[] = [];
  const takenAspects = new Set<string>();

  for (const rule of RULES) {
    if (takenAspects.has(rule.aspect.source)) continue;
    const match = remaining.match(rule.find);
    if (!match || match.index === undefined) continue;
    const phrase = match[0];
    const before = remaining.slice(0, match.index);
    const lead = before.match(new RegExp(`\\b${LEAD_WORDS}\\s+$`, "i"));
    const cutFrom = lead ? match.index - lead[0].length : match.index;
    const left = remaining.slice(0, cutFrom).trim();
    const right = remaining.slice(match.index + phrase.length).trim();
    const rest = `${left} ${right}`.replace(/\s+/g, " ").trim();
    // "ps5" alone is the console itself, not a filter on nothing.
    if (rest.split(" ").filter((word) => word.length > 1).length === 0) continue;
    const removed = remaining.slice(cutFrom, match.index + phrase.length).trim();
    remaining = rest;
    takenAspects.add(rule.aspect.source);
    filters.push({
      id: rule.id,
      aspect: rule.aspect,
      value: rule.value(match),
      label: rule.label(match),
      phrase: removed || phrase,
      text: rule.text(match),
      vehicle: rule.vehicle,
    });
  }
  return { query: remaining, filters };
}

export const textMatchesFilter = (filter: TypedFilter, text: string) => filter.text.test(text);
