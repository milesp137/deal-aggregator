/**
 * Simulated raw payloads from three marketplaces. Each deliberately has a DIFFERENT shape
 * (JSON API, JSON GraphQL-ish, raw HTML) so the normalizer in app/api/scrape/route.ts has
 * real work to do. Timestamps are relative to "now" so the feed always looks fresh.
 */

export interface EbayItem {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  itemLocation: { city: string; stateOrProvince: string; latitude: number; longitude: number };
  image?: { imageUrl: string };
  shortDescription: string;
  itemCreationDate: string;
}

export interface MarketplaceItem {
  id: string;
  marketplace_listing_title: string;
  listing_price: { amount: string; currency: string };
  location: { city: string; state: string; latitude: number; longitude: number };
  primary_photo_uri?: string | null;
  redacted_description: { text: string };
  /** Unix seconds. */
  creation_time: number;
}

interface CraigsRow {
  pid: string;
  title: string;
  price: string;
  hood: string;
  lat: number;
  lon: number;
  body: string;
  postedAt: Date;
}

const CITY = {
  torrance: { city: "Torrance", st: "CA", lat: 33.8358, lng: -118.3406 },
  longBeach: { city: "Long Beach", st: "CA", lat: 33.7701, lng: -118.1937 },
  irvine: { city: "Irvine", st: "CA", lat: 33.6846, lng: -117.8265 },
  santaAna: { city: "Santa Ana", st: "CA", lat: 33.7455, lng: -117.8677 },
  riverside: { city: "Riverside", st: "CA", lat: 33.9533, lng: -117.3962 },
  fontana: { city: "Fontana", st: "CA", lat: 34.0922, lng: -117.435 },
  ontario: { city: "Ontario", st: "CA", lat: 34.0633, lng: -117.6509 },
  sanDiego: { city: "San Diego", st: "CA", lat: 32.7157, lng: -117.1611 },
  bakersfield: { city: "Bakersfield", st: "CA", lat: 35.3733, lng: -119.0187 },
  vegas: { city: "Las Vegas", st: "NV", lat: 36.1699, lng: -115.1398 },
  phoenix: { city: "Phoenix", st: "AZ", lat: 33.4484, lng: -112.074 },
  sanJose: { city: "San Jose", st: "CA", lat: 37.3382, lng: -121.8863 },
  sacramento: { city: "Sacramento", st: "CA", lat: 38.5816, lng: -121.4944 },
  portland: { city: "Portland", st: "OR", lat: 45.5152, lng: -122.6784 },
} as const;

const minutesAgo = (now: number, minutes: number): Date => new Date(now - minutes * 60_000);

// Two scam listings share this exact body, as copy-paste scammers do across accounts/platforms.
const DUPLICATED_SCAM_BODY =
  "Brand new sealed console, never opened. Selling cheap because I received two as gifts. " +
  "Serious buyers only, price is firm. Message me for more pictures and details.";

export function getEbayPayload(now: number): EbayItem[] {
  const item = (
    itemId: string,
    title: string,
    price: number,
    loc: (typeof CITY)[keyof typeof CITY],
    shortDescription: string,
    mins: number,
  ): EbayItem => ({
    itemId,
    title,
    price: { value: price.toFixed(2), currency: "USD" },
    itemLocation: {
      city: loc.city,
      stateOrProvince: loc.st,
      latitude: loc.lat,
      longitude: loc.lng,
    },
    shortDescription,
    itemCreationDate: minutesAgo(now, mins).toISOString(),
  });

  return [
    item(
      "334100201",
      "1993 Nissan 240SX Drift Car - SR20DET, Roll Cage, Hydro E-Brake",
      11500,
      CITY.riverside,
      "Dedicated drift build, 38k miles on the swap. Clean title in hand. Weld-in cage, SR20DET with fresh rebuild, Wisefab angle kit, bucket seat. Ready for the next event.",
      42,
    ),
    item(
      "334100202",
      "Garrett G25-660 Turbo Kit - Brand New In Box",
      780,
      CITY.irvine,
      "Unused G25-660 with T3 flange, wastegate and oil feed lines. Bought for a build I never started. Receipt included, local pickup or insured shipping through the platform.",
      95,
    ),
    item(
      "334100203",
      "Volk Racing TE37 18x9.5 +22 Wheels Set of 4 (5x114.3)",
      2400,
      CITY.sanDiego,
      "Authentic TE37 in bronze, light curb rash on one lip, otherwise clean. Includes center caps and 4 lug nut set. Tires not included.",
      180,
    ),
    item(
      "334100204",
      "NVIDIA RTX 4090 Founders Edition - Like New",
      1150,
      CITY.vegas,
      "Only used for light rendering, original box and cables included. Purchased directly from NVIDIA, invoice available. Never mined on.",
      27,
    ),
    item(
      "334100205",
      "Sony A7 IV Mirrorless Body - 4,200 Shutter Count",
      1650,
      CITY.phoenix,
      "Excellent condition, two batteries, original box, strap and charger. Always used with a screen protector. Shutter count verified.",
      310,
    ),
    item(
      "334100206",
      "Wilwood 6-Piston Big Brake Kit - Front",
      1500,
      CITY.bakersfield,
      "Full front kit with 14 inch rotors, pads and braided lines. Fitment for popular drift chassis. Priced firm, I have already turned down lower offers.",
      720,
    ),
  ];
}

export function getMarketplacePayload(now: number): MarketplaceItem[] {
  const item = (
    id: string,
    title: string,
    price: number,
    loc: (typeof CITY)[keyof typeof CITY],
    text: string,
    mins: number,
  ): MarketplaceItem => ({
    id,
    marketplace_listing_title: title,
    listing_price: { amount: String(price), currency: "USD" },
    location: { city: loc.city, state: loc.st, latitude: loc.lat, longitude: loc.lng },
    primary_photo_uri: null,
    redacted_description: { text },
    creation_time: Math.floor(minutesAgo(now, mins).getTime() / 1000),
  });

  const base: MarketplaceItem[] = [
    item(
      "881200101",
      "2001 BMW E46 330Ci Drift Car - Cage, Angle Kit, Coilovers",
      6900,
      CITY.longBeach,
      "Built for sliding. Manual 330Ci with a full weld-in cage, FD coilovers, welded diff and an angle kit. Clean title, current registration. Cooling system fully refreshed last month.",
      18,
    ),
    item(
      "881200102",
      "Toyota Chaser JZX100 Tourer V - 1JZ-GTE Manual",
      14500,
      CITY.ontario,
      "Clean title, legally imported and registered. Manual swap done professionally with receipts. Stock turbo, no accidents. Happy to meet at a shop for a pre-purchase inspection.",
      130,
    ),
    item(
      "881200103",
      "2013 Subaru BRZ Track Car - $4,200 FIRM",
      4200,
      CITY.sanJose,
      "I am currently deployed overseas and need this gone. The car is in storage and a shipping agent will deliver it after I receive a wire transfer. No title right now, bill of sale only. Email me at fastcarz.deal@gmail.com to proceed.",
      11,
    ),
    item(
      "881200104",
      "PlayStation 5 Pro 2TB Bundle - Sealed",
      190,
      CITY.santaAna,
      DUPLICATED_SCAM_BODY,
      6,
    ),
    item(
      "881200105",
      "Apple MacBook Pro 16 M3 Max 48GB / 1TB",
      2100,
      CITY.santaAna,
      "Space black, 112 battery cycles, AppleCare+ through next year. Includes original charger and box. Cash or in-person bank transfer at a branch.",
      250,
    ),
    item(
      "881200106",
      "Steam Deck OLED 1TB + Official Dock",
      360,
      CITY.torrance,
      "Barely used, always in the case, includes dock and original charger. Selling to fund a new build.",
      74,
    ),
  ];

  // Rotating "fresh drops": a new one shows up in each 30s bucket so auto-refresh feels live.
  const drops: MarketplaceItem[] = [
    item(
      "881200901",
      "1998 Toyota Supra Turbo 6-Speed - Clean Title",
      42000,
      CITY.irvine,
      "Unmodified twin turbo, original paint on most panels, documented service history. Clean title in hand and ready to transfer. Serious inquiries only, inspections welcome.",
      0,
    ),
    item(
      "881200902",
      "Haltech Elite 2500 ECU + Plug-and-Play Harness",
      950,
      CITY.torrance,
      "Pulled from a car I sold. Base map included and tuned on a dyno. Includes the CAN keypad and a tuner-friendly datalog.",
      0,
    ),
    item(
      "881200903",
      "R32 Skyline GT-R Right Hand Drive - 25 Year Import",
      31000,
      CITY.fontana,
      "Legal import with all documentation. RB26 runs strong, no oil leaks. Clean title, new clutch and fresh timing belt service.",
      0,
    ),
    item(
      "881200904",
      "Work Meister S1 3P 18x10 +12 Wheels Set of 4",
      2100,
      CITY.longBeach,
      "Rare 3-piece staggered fitment set. Polished lips with a few light scratches, barrels straight. Includes caps and new hardware.",
      0,
    ),
  ];
  const bucket = Math.floor(now / 30_000);
  return [...base, drops[bucket % drops.length]];
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Returns a raw Craigslist-style HTML results page. The scraper must parse it with cheerio. */
export function getCraigslistHtml(now: number): string {
  const rows: CraigsRow[] = [
    {
      pid: "7712340001",
      title: "Mazda Miata NA 1.8 - Track / Drift Ready",
      price: "$5,200",
      hood: "Riverside",
      lat: CITY.riverside.lat,
      lon: CITY.riverside.lng,
      body: "Cage-ready NA with a clean title, new clutch, Bilstein coilovers and a limited slip. Garage kept, no rust. Cash in person only, bring a friend and a mechanic if you want.",
      postedAt: minutesAgo(now, 55),
    },
    {
      pid: "7712340002",
      title: "Bride Zeta III Bucket Seats Pair + Rails",
      price: "$650",
      hood: "Fontana",
      lat: CITY.fontana.lat,
      lon: CITY.fontana.lng,
      body: "Genuine Bride Zeta III in black, no tears or fading, includes low-mount side rails for a Nissan chassis. Pickup only.",
      postedAt: minutesAgo(now, 140),
    },
    {
      pid: "7712340003",
      title: "LS3 6.2L Engine Swap Kit w/ T56 Trans",
      price: "$4,300",
      hood: "Sacramento",
      lat: CITY.sacramento.lat,
      lon: CITY.sacramento.lng,
      body: "Complete drop-out LS3 with T56 Magnum, harness, ECU and mounts for an S-chassis. 41k miles, compression tested. Runs great on the stand.",
      postedAt: minutesAgo(now, 360),
    },
    {
      pid: "7712340004",
      title: "BC Racing BR Series Coilovers - Used 2k Miles",
      price: "$520",
      hood: "Long Beach",
      lat: CITY.longBeach.lat,
      lon: CITY.longBeach.lng,
      body: "Pulled off a car before I sold it, about 2,000 miles on them. Adjustable damping, no leaks, includes the spanner and top hats. Local meetup only.",
      postedAt: minutesAgo(now, 33),
    },
    {
      pid: "7712340005",
      title: "Nissan Silvia S15 Spec-R - Needs Title",
      price: "$9,800",
      hood: "Portland",
      lat: CITY.portland.lat,
      lon: CITY.portland.lng,
      body: "I lost the title and I only have a bill of sale. Great car, must sell today. Send a deposit to hold it and I will mail the keys once you pay the balance. Priced to move.",
      postedAt: minutesAgo(now, 22),
    },
    {
      pid: "7712340006",
      title: "Welded Differential Q45 R200 - Pro Built",
      price: "$620",
      hood: "Ontario",
      lat: CITY.ontario.lat,
      lon: CITY.ontario.lng,
      body: "Professionally welded Q45 diff, 4.08 ratio, installed for less than 3k miles of drifting. Fresh gear oil. Fits R200 swaps.",
      postedAt: minutesAgo(now, 205),
    },
    {
      pid: "7712340007",
      title: "iPhone 16 Pro Max 256GB Unlocked",
      price: "$1,050",
      hood: "Bakersfield",
      lat: CITY.bakersfield.lat,
      lon: CITY.bakersfield.lng,
      body: "Natural titanium, no scratches, always in a case. Battery health 98%. Comes with the box and cable.",
      postedAt: minutesAgo(now, 480),
    },
    {
      pid: "7712340008",
      title: "PS5 Pro Brand New Sealed",
      price: "$200",
      hood: "Santa Ana",
      lat: CITY.santaAna.lat,
      lon: CITY.santaAna.lng,
      body: DUPLICATED_SCAM_BODY,
      postedAt: minutesAgo(now, 9),
    },
  ];

  const items = rows
    .map(
      (row) => `
      <li class="result-row" data-pid="${row.pid}" data-lat="${row.lat}" data-lon="${row.lon}">
        <time class="result-date" datetime="${row.postedAt.toISOString()}"></time>
        <a href="/post/${row.pid}.html" class="result-title hdrlnk">${escapeHtml(row.title)}</a>
        <span class="result-price">${escapeHtml(row.price)}</span>
        <span class="result-hood"> (${escapeHtml(row.hood)})</span>
        <p class="result-desc">${escapeHtml(row.body)}</p>
      </li>`,
    )
    .join("\n");

  return `<!doctype html><html><body><ul class="rows">${items}</ul></body></html>`;
}
