/**
 * What a Feed Item is counted in: kilos, litres, or bundles — a closed list, because the farm's arithmetic depends on
 * which it is. A kilo is weighed to ten grams under a kilo and a hundred above; a bundle of napier is counted whole; a
 * line "for every hundred kilos of body weight" means something in kilos or litres and nothing in bundles; and a maund
 * is thirty-seven kilos, not thirty-seven of anything else.
 */

/** A maund — the mon a Bangladeshi feed trader weighs in — in kilograms. */
export const MAUND_KG = 37.324;

export const FEED_UNITS = ["kg", "litre", "bundle"] as const;
export type FeedUnit = (typeof FEED_UNITS)[number];

/** The unit's name in both languages, as a figure is read aloud: "৪ কেজি", "২ আঁটি". */
export const FEED_UNIT_WORDS = {
  kg: { bn: "কেজি", en: "kg" },
  litre: { bn: "লিটার", en: "litres" },
  bundle: { bn: "আঁটি", en: "bundles" },
} as const satisfies Record<FeedUnit, { bn: string; en: string }>;

/** A unit stored before the list was closed, or read off an old cache, as the closest the farm now keeps. */
export const feedUnitOf = (unit: string): FeedUnit =>
  (FEED_UNITS as readonly string[]).includes(unit) ? (unit as FeedUnit) : "kg";

/** A Feed Item's unit said in the reader's language, as a figure is read aloud: "৪ কেজি", "4 kg". */
export const feedUnitWord = (unit: string, language: "bn" | "en"): string =>
  FEED_UNIT_WORDS[feedUnitOf(unit)][language];

/** The unit as one of it is said, for a price or a rate: "৳৫০ প্রতি লিটার", "৳50 per litre". */
export const FEED_UNIT_EACH = {
  kg: { bn: "কেজি", en: "kg" },
  litre: { bn: "লিটার", en: "litre" },
  bundle: { bn: "আঁটি", en: "bundle" },
} as const satisfies Record<FeedUnit, { bn: string; en: string }>;

/** A Feed Item's unit as one of it is said, in the reader's language. */
export const feedUnitEach = (unit: string, language: "bn" | "en"): string =>
  FEED_UNIT_EACH[feedUnitOf(unit)][language];

/** Whether a Ration's line may be written for every hundred kilos of body weight: a quantity, not a count. */
export const mayGoByWeight = (unit: FeedUnit): boolean => unit !== "bundle";

/** How feed may be bought other than in its own unit: by the bag, whose weight the farm sets for each feed, or by
 *  the maund a trader's slip gives. Both for feed counted in kilos only. */
export const FEED_PACKS = ["bag", "maund"] as const;
export type FeedPack = (typeof FEED_PACKS)[number];

/** The pack's name in both languages. */
export const FEED_PACK_WORDS = {
  bag: { bn: "বস্তা", en: "bags" },
  maund: { bn: "মণ", en: "maunds" },
} as const satisfies Record<FeedPack, { bn: string; en: string }>;

/** Why feed cannot be bought in a pack. */
export type PackRefusal = "pack_needs_kg" | "bag_size_unknown";

/**
 * What so many bags or maunds come to in the feed's own unit, or why it cannot be said: a pack is kilos, so feed
 * counted otherwise has none, and a bag is only as heavy as the farm has said this feed's bags are.
 */
export const quantityOfPacks = (
  pack: { kind: FeedPack; count: number },
  item: { unit: FeedUnit; bagSizeKg: number | null }
): { quantity: number } | { refusal: PackRefusal } => {
  if (item.unit !== "kg") {
    return { refusal: "pack_needs_kg" };
  }
  if (pack.kind === "maund") {
    return { quantity: pack.count * MAUND_KG };
  }
  if (item.bagSizeKg === null || item.bagSizeKg <= 0) {
    return { refusal: "bag_size_unknown" };
  }
  return { quantity: pack.count * item.bagSizeKg };
};
