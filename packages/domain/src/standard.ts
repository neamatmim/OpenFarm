/**
 * The standard lists a farm may start with instead of an empty store: the Feed Items a Bangladeshi dairy and
 * fattening farm feeds, the Rations those make, the medicines its Vet is most often asked for, and the diseases the
 * DLS must be told of. Names only — a price, a stock level, a Pen a Ration is fed to and a product's withdrawal days
 * are the farm's own facts, and the days the Vet's alone.
 */
import type { RationLine, WeightBand } from "./feed";
import type { StandardSopNeed } from "./standard-playbook";

interface Named {
  bn: string;
  en: string;
}

export const STANDARD_FEED_ITEMS = {
  napier: { bn: "নেপিয়ার ঘাস", en: "Napier grass" },
  straw: { bn: "ধানের খড়", en: "Rice straw" },
  silage: { bn: "ভুট্টার সাইলেজ", en: "Maize silage" },
  bran: { bn: "গমের ভুসি", en: "Wheat bran" },
  mustardCake: { bn: "সরিষার খৈল", en: "Mustard oil cake" },
  maize: { bn: "ভাঙা ভুট্টা", en: "Crushed maize" },
  pulseHusk: { bn: "ডালের ভুসি", en: "Pulse husk" },
  concentrate: { bn: "ডেইরি কনসেনট্রেট", en: "Dairy concentrate" },
  minerals: { bn: "মিনারেল মিক্সচার", en: "Mineral mixture" },
  salt: { bn: "লবণ", en: "Salt" },
} as const satisfies Record<string, Named>;
export type StandardFeedKey = keyof typeof STANDARD_FEED_ITEMS;

/** One line of a standard Ration: so many kg a day for each animal, or — marked — for every 100 kg of body weight. */
export type StandardLine =
  | readonly [StandardFeedKey, number]
  | readonly [StandardFeedKey, number, "per100kg"];

/** A Ration as the standard gives it: its lines, the weights it is written for, and what it was worked out from. */
export interface StandardRation {
  name: Named;
  items: readonly StandardLine[];
  band?: WeightBand;
  /** Said with its first Version, so a farm reading it later knows where the figures came from. */
  note?: string;
}

/** A standard line as the farm's Ration keeps it, once its Feed Item has an id on this farm. */
export const rationLineOf = (
  [key, kg, per]: StandardLine,
  idOf: (key: StandardFeedKey) => string
): RationLine =>
  per === "per100kg"
    ? { feedItemId: idOf(key), kgPer100KgPerDay: kg }
    : { feedItemId: idOf(key), kgPerAnimalPerDay: kg };

/**
 * The fattening Rations by weight, 100 kg to 1000 kg, worked out from published standards rather than guessed:
 *
 * - Dry matter a day falls as a bull grows: about 2.9% of body weight at 125 kg down to 2.0% past 500 kg — ICAR 2013
 *   (2.5–3.0% for young stock) and NASEM 2016 via Univ. of Arkansas MP391 (about 2.0% for bulls of 635–816 kg).
 * - Concentrate is 45–55% of that dry matter: BLRI/BAU trials found 55:45 concentrate to roughage the cheapest for
 *   the same gain (Rashid et al. 2015, JAST 5:286), and ICAR puts the ceiling at 60% against acidosis.
 * - Crude protein 13.7% for the youngest down to 11% for the heaviest — above the temperate tables, as Bangladeshi
 *   trials formulate (12.5–14.5%; Joya et al. 2026 find tropical calves need more than NRC 1996).
 * - Mustard cake stays under 1–1.5 kg a day even for a 1000 kg bull (NDDB 2012); minerals 50 g a head for growing
 *   stock (NDDB), salt about 25–60 g.
 * - Feeds as analysed in the region: napier 17% dry matter and 10.5% protein, rice straw 92% and 4%, crushed maize
 *   89% and 9.5%, wheat bran 89% and 15.5%, mustard cake 92% and 36%, pulse husk 89% and 16.7% (Feedipedia, NDDB
 *   2012, Siddque et al. 2015).
 *
 * Under 100 kg a calf lives on milk and calf starter, which is the calf's Ration, by the head. A bull bought in eats
 * the arrival Ration first, at 30% concentrate: cattle are stepped up to grain over three weeks at least (Merck).
 * Starting points, to be checked against the farm's own feed and the Vet — the Leftovers and the Average Daily Gain
 * say whether they suit.
 */
const BY_WEIGHT_NOTE =
  "প্রকাশিত খাদ্যমান (ICAR, NASEM, BLRI/BAU গবেষণা, NDDB) থেকে হিসাব করা; খাবার প্রতি ১০০ কেজি ওজনে, মিনারেল ও লবণ প্রতি পশু। নিজের খাবার আর ভেটের সাথে মিলিয়ে নিন।";

export const STANDARD_RATIONS = {
  milking: {
    name: { bn: "দোহনকালীন গাভীর রেশন", en: "Milking cow ration" },
    items: [
      ["napier", 25],
      ["straw", 4],
      ["silage", 8],
      ["concentrate", 6],
      ["mustardCake", 1],
      ["minerals", 0.1],
    ],
  },
  dry: {
    name: { bn: "শুকনো ও গর্ভবতী গাভীর রেশন", en: "Dry and close-up cow ration" },
    items: [
      ["napier", 20],
      ["straw", 5],
      ["bran", 2],
      ["mustardCake", 0.5],
      ["minerals", 0.1],
    ],
  },
  heifer: {
    name: { bn: "বকনার রেশন", en: "Heifer ration" },
    items: [
      ["napier", 15],
      ["straw", 3],
      ["bran", 1.5],
      ["minerals", 0.05],
    ],
  },
  calf: {
    name: { bn: "বাছুরের রেশন", en: "Calf ration" },
    items: [
      ["napier", 3],
      ["bran", 0.8],
      ["concentrate", 0.5],
    ],
    // Milk and calf starter, by the head. A fattening calf past 100 kg is pointed out for the bull starter.
    band: { fromKg: null, toKg: 100 },
  },
  // Bought in: mostly grass and straw for the first two or three weeks, while the rumen learns grain.
  arrival: {
    name: { bn: "নতুন আসা ষাঁড়ের রেশন", en: "New arrival ration" },
    items: [
      ["napier", 5.65, "per100kg"],
      ["straw", 0.85, "per100kg"],
      ["maize", 0.2, "per100kg"],
      ["bran", 0.3, "per100kg"],
      ["mustardCake", 0.2, "per100kg"],
      ["pulseHusk", 0.15, "per100kg"],
      ["minerals", 0.05],
      ["salt", 0.03],
    ],
    note: BY_WEIGHT_NOTE,
  },
  bullStarter: {
    name: { bn: "ষাঁড় শুরুর রেশন", en: "Bull starter ration" },
    items: [
      ["napier", 5.65, "per100kg"],
      ["straw", 0.7, "per100kg"],
      ["maize", 0.35, "per100kg"],
      ["bran", 0.45, "per100kg"],
      ["mustardCake", 0.45, "per100kg"],
      ["pulseHusk", 0.2, "per100kg"],
      ["minerals", 0.04],
      ["salt", 0.025],
    ],
    band: { fromKg: 100, toKg: 150 },
    note: BY_WEIGHT_NOTE,
  },
  bullGrower: {
    name: { bn: "বাড়ন্ত ষাঁড়ের রেশন", en: "Bull grower ration" },
    items: [
      ["napier", 4.8, "per100kg"],
      ["straw", 0.75, "per100kg"],
      ["maize", 0.4, "per100kg"],
      ["bran", 0.4, "per100kg"],
      ["mustardCake", 0.35, "per100kg"],
      ["pulseHusk", 0.2, "per100kg"],
      ["minerals", 0.05],
      ["salt", 0.035],
    ],
    band: { fromKg: 150, toKg: 250 },
    note: BY_WEIGHT_NOTE,
  },
  bullFinisher: {
    name: { bn: "ষাঁড় মোটাতাজাকরণ রেশন ১", en: "Bull finisher ration 1" },
    items: [
      ["napier", 3.7, "per100kg"],
      ["straw", 0.7, "per100kg"],
      ["maize", 0.55, "per100kg"],
      ["bran", 0.4, "per100kg"],
      ["mustardCake", 0.2, "per100kg"],
      ["pulseHusk", 0.2, "per100kg"],
      ["minerals", 0.06],
      ["salt", 0.04],
    ],
    band: { fromKg: 250, toKg: 350 },
    note: BY_WEIGHT_NOTE,
  },
  bullLateFinisher: {
    name: { bn: "ষাঁড় মোটাতাজাকরণ রেশন ২", en: "Bull finisher ration 2" },
    items: [
      ["napier", 3.05, "per100kg"],
      ["straw", 0.55, "per100kg"],
      ["maize", 0.65, "per100kg"],
      ["bran", 0.35, "per100kg"],
      ["mustardCake", 0.2, "per100kg"],
      ["pulseHusk", 0.2, "per100kg"],
      ["minerals", 0.08],
      ["salt", 0.05],
    ],
    band: { fromKg: 350, toKg: 500 },
    note: BY_WEIGHT_NOTE,
  },
  heavyBull: {
    name: { bn: "বড় ষাঁড়ের রেশন", en: "Heavy bull ration" },
    items: [
      ["napier", 2.4, "per100kg"],
      ["straw", 0.55, "per100kg"],
      ["maize", 0.6, "per100kg"],
      ["bran", 0.3, "per100kg"],
      ["mustardCake", 0.1, "per100kg"],
      ["pulseHusk", 0.2, "per100kg"],
      ["minerals", 0.1],
      ["salt", 0.06],
    ],
    band: { fromKg: 500, toKg: null },
    note: BY_WEIGHT_NOTE,
  },
  sick: {
    name: { bn: "অসুস্থ পশুর নরম রেশন", en: "Sick animal soft ration" },
    items: [
      ["napier", 10],
      ["bran", 1],
      ["minerals", 0.05],
    ],
  },
} as const satisfies Record<string, StandardRation>;
export type StandardRationKey = keyof typeof STANDARD_RATIONS;

/** Put on the Drug List for the Vet to fill in: without withdrawal days nothing may prescribe them yet. */
export const STANDARD_DRUGS = {
  oxytet: {
    bn: "অক্সিটেট্রাসাইক্লিন ২০% ইনজেকশন",
    en: "Oxytetracycline 20% LA injection",
  },
  penstrep: { bn: "পেনিসিলিন-স্ট্রেপটোমাইসিন", en: "Penicillin-Streptomycin" },
  ceftiofur: { bn: "সেফটিওফার ইনজেকশন", en: "Ceftiofur injection" },
  meloxicam: { bn: "মেলোক্সিক্যাম ইনজেকশন", en: "Meloxicam injection" },
  intramammary: {
    bn: "ওলানের টিউব (ক্লক্সাসিলিন)",
    en: "Intramammary tube (Cloxacillin)",
  },
  calcium: { bn: "ক্যালসিয়াম বোরোগ্লুকোনেট", en: "Calcium borogluconate" },
  fmd: { bn: "এফএমডি টিকা (ট্রাইভ্যালেন্ট)", en: "FMD vaccine (trivalent)" },
  lsd: { bn: "লাম্পি স্কিন টিকা", en: "Lumpy skin disease vaccine" },
  albendazole: { bn: "অ্যালবেনডাজল কৃমিনাশক", en: "Albendazole drench" },
  // For liver fluke, which two Bangladesh studies (2022, 2026) found triclabendazole no longer clears.
  oxyclozanide: {
    bn: "অক্সিক্লোজানাইড (কলিজা কৃমির ওষুধ)",
    en: "Oxyclozanide (liver fluke drench)",
  },
  hs: { bn: "গলাফোলা রোগের টিকা", en: "Haemorrhagic septicaemia (HS) vaccine" },
  bq: { bn: "বাদলা রোগের টিকা", en: "Black quarter (BQ) vaccine" },
  anthrax: { bn: "তড়কা রোগের টিকা", en: "Anthrax vaccine" },
  cypermethrin: {
    bn: "সাইপারমেথ্রিন স্প্রে (আঁটুলি ও মাছি)",
    en: "Cypermethrin spray (ticks and flies)",
  },
} as const satisfies Record<string, Named>;
export type StandardDrugKey = keyof typeof STANDARD_DRUGS;

/** The standard product each campaign in the Standard Playbook would give, offered first when the Owner adopts it. */
export const STANDARD_DRUG_FOR: Record<
  Exclude<StandardSopNeed, "calvingPen">,
  StandardDrugKey
> = {
  fmdVaccine: "fmd",
  lsdVaccine: "lsd",
  dewormer: "albendazole",
  flukeDrench: "oxyclozanide",
  hsVaccine: "hs",
  bqVaccine: "bq",
  anthraxVaccine: "anthrax",
  tickSpray: "cypermethrin",
};

/** The diseases a farm must report to the Upazila Livestock Office. */
export const STANDARD_NOTIFIABLE_DISEASES = [
  { bn: "ক্ষুরা রোগ", en: "Foot-and-mouth disease" },
  { bn: "তড়কা", en: "Anthrax" },
  { bn: "লাম্পি স্কিন ডিজিজ", en: "Lumpy skin disease" },
  { bn: "গলাফোলা", en: "Haemorrhagic septicaemia" },
  { bn: "বাদলা", en: "Black quarter" },
  { bn: "ব্রুসেলোসিস", en: "Brucellosis" },
] as const satisfies readonly Named[];

/**
 * The breeds a Bangladeshi dairy and fattening farm meets: the local cattle and the four local breeds BLRI
 * recognises, and the imported breeds and their crosses. Spelled as the farm writes them — ক্রস, not সংকর. Every farm
 * is given these the first time it opens its list, and keeps any it already wrote under the same name.
 */
export const STANDARD_BREEDS = {
  local: { bn: "দেশি", en: "Local" },
  redChittagong: { bn: "রেড চিটাগাং", en: "Red Chittagong" },
  pabna: { bn: "পাবনা ক্যাটল", en: "Pabna" },
  munshiganj: { bn: "মুন্সিগঞ্জ ক্যাটল", en: "Munshiganj" },
  northBengalGrey: { bn: "নর্থ বেঙ্গল গ্রে", en: "North Bengal Grey" },
  friesian: { bn: "হলস্টেইন ফ্রিজিয়ান", en: "Holstein Friesian" },
  friesianCross: {
    bn: "হলস্টেইন ফ্রিজিয়ান ক্রস",
    en: "Holstein Friesian cross",
  },
  sahiwal: { bn: "শাহীওয়াল", en: "Sahiwal" },
  sahiwalCross: { bn: "শাহীওয়াল ক্রস", en: "Sahiwal cross" },
  jersey: { bn: "জার্সি", en: "Jersey" },
  jerseyCross: { bn: "জার্সি ক্রস", en: "Jersey cross" },
  redSindhi: { bn: "রেড সিন্ধি", en: "Red Sindhi" },
  brahmanCross: { bn: "ব্রাহমা ক্রস", en: "Brahman cross" },
} as const satisfies Record<string, Named>;
export type StandardBreedKey = keyof typeof STANDARD_BREEDS;
export const STANDARD_BREED_KEYS = Object.keys(
  STANDARD_BREEDS
) as StandardBreedKey[];

/** What the Owner may start the farm with, a tick each. Rations bring the Feed Items they name. */
export const STANDARD_KINDS = ["feed", "rations", "health"] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];
