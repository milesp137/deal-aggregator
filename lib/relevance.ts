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
  "steel ?(?:books?|box)",
  "limited run",
  "physical (?:copy|in box)",
  "ea sports",
  "bot lobby",
  "thermal (?:paste|putty|pads?)",
  "liquid metal",
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
/**
 * Words dropshippers pile into one title to match every search ("Hand Drill Survival Gear Tool
 * Jungle Camping Bushcraft Kit"). Any single one is normal; four different ones is stuffing.
 */
const STUFFING_TERMS = [
  "multi-?functional?",
  "multi-?tools?",
  "portable",
  "outdoor",
  "tactical",
  "survival",
  "bushcraft",
  "emergency",
  "gadgets?",
  "edc",
  "kits?",
  "tools?",
  "gear",
  "universal",
  "durable",
  "waterproof",
  "lightweight",
  "heavy[ -]duty",
  "professional",
  "premium",
  "high[ -]quality",
  "hot sale",
  "fashion",
  "creative",
  "mini",
];
const STUFFING_REGEXES = STUFFING_TERMS.map((term) => new RegExp(`\\b(?:${term})\\b`, "i"));
const STUFFING_MIN_DISTINCT = 4;

/** True when a title strings together many generic marketing words. */
export function isKeywordStuffed(text: string): boolean {
  let hits = 0;
  for (const pattern of STUFFING_REGEXES) {
    if (pattern.test(text) && ++hits >= STUFFING_MIN_DISTINCT) return true;
  }
  return false;
}

const GAME_LISTING =
  /\([^)]*\b(?:playstation|xbox|nintendo|switch|wii|ps\d)\b[^)]*,\s*(?:19|20)\d{2}\)/i;

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
  // Words the shopper typed don't count ("camping gear" typed: "camping"/"gear" aren't stuffing).
  if (isKeywordStuffed(rest)) return "junk";
  // Video games are titled "<Game> (Sony PlayStation 5, 2026)": platform and year in brackets.
  if (GAME_LISTING.test(rest)) return "junk";

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

/* ------------------------------------------------------------------- vehicle parts */

const VEHICLE_WORDS = [
  "jeep", "ford", "chevy", "chevrolet", "dodge", "ram", "gmc", "chrysler", "buick", "cadillac", "lincoln",
  "pontiac", "oldsmobile", "plymouth", "mercury", "saturn", "hummer", "tesla", "nissan", "datsun", "infiniti",
  "toyota", "lexus", "scion", "honda", "acura", "mazda", "subaru", "mitsubishi", "suzuki", "isuzu", "hyundai",
  "kia", "genesis", "bmw", "mini", "mercedes", "benz", "audi", "volkswagen", "vw", "porsche", "volvo", "saab",
  "jaguar", "land rover", "range rover", "fiat", "alfa romeo", "mustang", "camaro", "corvette", "charger",
  "challenger", "wrangler", "cherokee", "bronco", "civic", "accord", "miata", "mx-?5", "supra", "silvia",
  "skyline", "240sx", "300zx", "350z", "370z", "wrx", "sti", "evo", "lancer", "tacoma", "tundra", "f-?150",
  "silverado", "sierra", "truck", "pickup truck", "suv", "sedan", "coupe", "hatchback", "wagon", "minivan",
  "car", "cars", "motorcycle",
];
const VEHICLE_QUERY = new RegExp(`\\b(?:${VEHICLE_WORDS.join("|")})\\b`, "i");

/** True when the search is about a car, truck or similar (so "mirror" means a car part). */
export const isVehicleQuery = (query: string) => VEHICLE_QUERY.test(query);

/** Nouns that mean "a component or accessory for a vehicle", not the vehicle itself. */
const VEHICLE_PART_TERMS = [
  "bumpers?", "fenders?", "hoods?", "grille?s?", "mirrors?", "doors?", "tailgates?", "lift ?gates?",
  "trunk lids?", "windshields?", "quarter panels?", "spoilers?", "running boards?", "nerf bars?",
  "bull ?bars?", "roof racks?", "hitch(?:es)?", "tow hooks?", "lift kits?", "body kits?",
  "head ?lights?", "tail ?lights?", "fog ?lights?", "head ?lamps?", "tail ?lamps?", "lights?", "lamps?",
  "axles?", "transmissions?", "transfer cases?", "differentials?", "drive ?shafts?", "u-?joints?",
  "clutch(?: kits?)?", "flywheels?", "engines?", "motors?", "cylinder heads?", "pistons?", "crank ?shafts?",
  "cam ?shafts?", "timing (?:belts?|chains?|kits?)", "gaskets?", "turbos?", "turbochargers?",
  "superchargers?", "intakes?", "manifolds?", "exhausts?", "mufflers?", "catalytic", "downpipes?", "headers?",
  "radiators?", "condensers?", "compressors?", "alternators?", "starters?", "water pumps?", "fuel pumps?",
  "pumps?", "injectors?", "throttle bod(?:y|ies)", "sensors?", "modules?", "ecus?", "pcms?", "tcms?",
  "fuse boxes?", "wiring harness(?:es)?", "harness(?:es)?", "relays?", "switch(?:es)?", "ignition coils?",
  "spark plugs?", "brakes?", "rotors?", "calipers?", "brake pads?", "master cylinders?", "struts?", "shocks?",
  "coil ?overs?", "springs?", "control arms?", "sway bars?", "bushings?", "ball joints?", "tie rods?",
  "bearings?", "hubs?", "wheels?", "rims?", "tires?", "hub ?caps?", "lug nuts?", "seats?", "seat covers?",
  "dash(?:board)?s?", "center consoles?", "steering wheels?", "shift knobs?", "shifters?", "pedals?",
  "carpets?", "floor mats?", "headliners?", "sun ?visors?", "door panels?", "arm ?rests?", "emblems?",
  "badges?", "key fobs?", "fobs?", "wipers?", "hoses?", "belts?", "filters?", "gas caps?", "brackets?",
  "moldings?", "weather ?strip(?:ping)?", "latch(?:es)?", "handles?", "hinges?", "linkages?",
  "oem", "aftermarket", "replacement", "fitment", "compatible", "part numbers?",
  // "fits 1997-2001 Jeep": a model-year range is how parts advertise what they fit
  "fits?",
];
const VEHICLE_PART = new RegExp(`\\b(?:${VEHICLE_PART_TERMS.join("|")})\\b`, "i");
const FITMENT_YEARS = /\b(?:19|20)\d{2}\s?[-–to]+\s?(?:(?:19|20)\d{2}|\d{2})\b/i;
/** Things only a whole vehicle's listing says. */
const WHOLE_VEHICLE =
  /\b\d{2,3}(?:,\d{3})?\s?k?\s?(?:miles|mi)\b|\bvin\b|\bclean title\b|\bsalvage title\b|\bruns (?:and|&) drives\b|\bone owner\b|\b\d\.\dl\b.*\b(?:4x4|awd|4wd|fwd|rwd)\b/i;

/** True when the search itself names a part ("coilovers", "te37 wheels"): then parts are the item. */
export const isPartQuery = (query: string) => VEHICLE_PART.test(query);

/**
 * For vehicle searches: does this title read like a component or accessory rather than a whole
 * vehicle? The words the shopper typed are ignored. Callers decide when this applies (only for
 * vehicle searches that aren't themselves searching for a part).
 */
export function looksLikeVehiclePart(title: string, query: string): boolean {
  if (WHOLE_VEHICLE.test(title)) return false;
  // "Four-wheel-drive" and "2WD wheels" style phrases describe the vehicle, not a wheel for sale.
  const rest = withoutQueryTerms(title, termsOf(query)).replace(
    /\b(?:four|4|two|2|all|front|rear)[- ]wheel[- ]drive\b/gi,
    " ",
  );
  return VEHICLE_PART.test(rest) || FITMENT_YEARS.test(rest);
}
