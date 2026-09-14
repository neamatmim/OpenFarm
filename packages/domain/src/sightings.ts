import { HEAT } from "./breeding";

/**
 * What somebody can report seeing of an animal when no round asked — the same words the health round offers, so a
 * limp noticed at the gate and a limp noticed on the round are one kind of thing to the Vet, and a heat noticed
 * either way begins the same breeding work. "Something else" always carries a note saying what.
 */
export const SIGHTINGS = [
  { value: HEAT, bn: "গরম হয়েছে", en: "In heat" },
  { value: "lame", bn: "খোঁড়াচ্ছে", en: "Lame" },
  { value: "off_feed", bn: "খাবারে অরুচি", en: "Off feed" },
  { value: "mastitis", bn: "ওলান ফোলা/শক্ত", en: "Swollen or hard udder" },
  { value: "cough", bn: "কাশি", en: "Coughing" },
  { value: "other", bn: "অন্য কিছু", en: "Something else" },
] as const;

export type Sighting = (typeof SIGHTINGS)[number];

export const sightingOf = (value: string): Sighting | undefined =>
  SIGHTINGS.find((sighting) => sighting.value === value);

/** The one sighting that is nothing without words saying what it was. */
export const SIGHTING_NEEDING_A_NOTE = "other";
