import { HEAT } from "./breeding";

/**
 * What somebody can report seeing of an animal when no round asked — the same words the health round offers, so a
 * limp noticed at the gate and a limp noticed on the round are one kind of thing to the Vet, and a heat noticed
 * either way begins the same breeding work. "Something else" always carries a note saying what.
 */
export const OBSERVATION_WORDS = [
  { value: HEAT, bn: "গরম হয়েছে", en: "In heat" },
  { value: "lame", bn: "খোঁড়াচ্ছে", en: "Lame" },
  { value: "off_feed", bn: "খাবারে অরুচি", en: "Off feed" },
  { value: "mastitis", bn: "ওলান ফোলা/শক্ত", en: "Swollen or hard udder" },
  { value: "cough", bn: "কাশি", en: "Coughing" },
  {
    value: "mouth_foot_sores",
    bn: "মুখে বা ক্ষুরে ঘা",
    en: "Sores on mouth or feet",
  },
  { value: "not_suckling", bn: "বাছুর দুধ টানছে না", en: "Calf not suckling" },
  {
    value: "navel_swollen",
    bn: "নাভি ফোলা বা পুঁজ",
    en: "Navel swollen or discharging",
  },
  { value: "down_cow", bn: "বসে আছে, উঠতে পারছে না", en: "Down, cannot rise" },
  {
    value: "afterbirth_retained",
    bn: "ফুল পড়েনি (১২ ঘণ্টা পেরিয়ে)",
    en: "Afterbirth not passed after 12 hours",
  },
  { value: "other", bn: "অন্য কিছু", en: "Something else" },
] as const;

export type ObservationWord = (typeof OBSERVATION_WORDS)[number];

export const observationWordOf = (value: string): ObservationWord | undefined =>
  OBSERVATION_WORDS.find((word) => word.value === value);

/** The one word that says nothing without a note saying what was seen. */
export const OBSERVATION_WORD_NEEDING_A_NOTE = "other";
