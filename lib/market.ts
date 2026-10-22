/** Default search origin (Los Angeles, CA). The API accepts overrides via originLat/originLng. */
export const DEFAULT_ORIGIN = {
  label: "Los Angeles, CA",
  lat: 34.0522,
  lng: -118.2437,
};

export interface MarketRule {
  category: string;
  /** Matched against the lowercase listing TITLE only; first matching rule wins. */
  pattern: RegExp;
  /** Typical used-market price in USD. */
  median: number;
}

/**
 * Stand-in for a real price-history service. The first matching rule wins, and rules are
 * ordered electronics, then whole vehicles, then parts. That means a part whose title
 * names a chassis code (e.g. "S14 coilovers") would be priced as the whole car, so keep
 * part titles free of chassis codes, or replace this with a proper classifier.
 */
export const MARKET_RULES: MarketRule[] = [
  // Electronics
  { category: "PlayStation 5", pattern: /\bps5\b|playstation 5/, median: 500 },
  { category: "GPU", pattern: /\brtx\b|geforce/, median: 1500 },
  { category: "MacBook", pattern: /macbook/, median: 3000 },
  { category: "Handheld PC", pattern: /steam deck/, median: 450 },
  { category: "Smartphone", pattern: /iphone/, median: 800 },
  { category: "Camera", pattern: /sony a7|\ba7 ?iv\b|mirrorless/, median: 1800 },

  // Vehicles
  { category: "Toyota Supra", pattern: /\bsupra\b/, median: 60000 },
  { category: "Nissan Skyline", pattern: /skyline|\bgt-?r\b/, median: 38000 },
  { category: "Toyota JZX", pattern: /\bjzx\d*|chaser|cresta|mark ii/, median: 16000 },
  { category: "Nissan S-chassis", pattern: /240sx|\bs1[345]\b|silvia/, median: 14000 },
  { category: "BMW drift chassis", pattern: /\be(30|36|46)\b/, median: 9000 },
  { category: "Mazda Miata", pattern: /miata|mx-?5/, median: 7500 },
  { category: "Subaru BRZ / GR86", pattern: /\bbrz\b|gt ?86|\bfr-?s\b|\bgr86\b/, median: 13000 },

  // Performance parts
  { category: "Turbo", pattern: /garrett|turbo kit|\bg25\b|gt[23]\d{3}/, median: 1300 },
  { category: "Engine swap", pattern: /\bls[1-9]\b|engine swap|ls swap/, median: 5500 },
  { category: "Standalone ECU", pattern: /\becu\b|haltech|motec|link g4x/, median: 1400 },
  { category: "Coilovers", pattern: /coilover|bc racing/, median: 1000 },
  { category: "Wheels", pattern: /wheels?\b|\bte37\b|volk|\brims\b|work meister/, median: 3200 },
  { category: "Seats", pattern: /bucket seats?|recaro|bride|\bseats\b/, median: 900 },
  { category: "Brakes", pattern: /brake kit|wilwood|big brake/, median: 1200 },
  { category: "Differential", pattern: /differential|\blsd\b|\bq45\b/, median: 900 },
];

export function lookupMarket(title: string): MarketRule | null {
  const lower = title.toLowerCase();
  return MARKET_RULES.find((rule) => rule.pattern.test(lower)) ?? null;
}
