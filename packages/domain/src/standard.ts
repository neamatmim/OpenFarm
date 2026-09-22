/**
 * The standard lists a farm may start with instead of an empty store: the Feed Items a Bangladeshi dairy and
 * fattening farm feeds, the Rations those make, the medicines its Vet is most often asked for, and the diseases the
 * DLS must be told of. Names only — a price, a stock level, a Pen a Ration is fed to and a product's withdrawal days
 * are the farm's own facts, and the days the Vet's alone.
 */
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
} as const satisfies Record<string, Named>;
export type StandardFeedKey = keyof typeof STANDARD_FEED_ITEMS;

/** A Ration as the standard gives it: kg of each Feed Item per animal per day. */
export interface StandardRation {
  name: Named;
  items: [StandardFeedKey, number][];
}

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
  },
  fattening: {
    name: { bn: "মোটাতাজাকরণ রেশন", en: "Fattening ration" },
    items: [
      ["napier", 12],
      ["straw", 3],
      ["maize", 3],
      ["bran", 2],
      ["mustardCake", 1],
      ["pulseHusk", 1.5],
      ["minerals", 0.08],
    ],
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

/** What the Owner may start the farm with, a tick each. Rations bring the Feed Items they name. */
export const STANDARD_KINDS = ["feed", "rations", "health"] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];
