import type { SideStretch } from "./adult-deaths";

/**
 * How the dairy herd turns over, and how often the farm's animals fall sick — measures a dairy is run by. A cow leaves
 * the milking herd however she goes: dead, culled, sold to a butcher, crossed to Fattening for Eid, or lost; counting
 * only the culls a Mortality records misses the cow sold at the market, the commonest way out. Each is read over
 * cow-years: a cow's days on the Dairy side once she has calved.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_A_YEAR = 365;
const HUNDRED = 100;

/** What clinical mastitis is written as on a Diagnosis: the common list's word, as the death form's. */
export const MASTITIS = "ওলান প্রদাহ";

/**
 * What a Vet most often finds in cattle on a Bangladeshi farm, offered on the Diagnosis form beside the notifiable
 * diseases. Written in Bangla whoever picks one, so the sickness figures count one disease once; anything else is
 * still typed freely.
 */
export const COMMON_DISEASES = [
  { bn: MASTITIS, en: "Mastitis" },
  { bn: "দুধ জ্বর", en: "Milk fever" },
  { bn: "জরায়ু প্রদাহ", en: "Metritis" },
  { bn: "ফুল আটকে যাওয়া", en: "Retained afterbirth" },
  { bn: "পেট ফাঁপা", en: "Bloat" },
  { bn: "পাতলা পায়খানা", en: "Diarrhoea" },
  { bn: "নিউমোনিয়া", en: "Pneumonia" },
  { bn: "খোঁড়া রোগ", en: "Lameness" },
  { bn: "রক্ত প্রস্রাব (বাবেসিয়া)", en: "Tick fever (babesiosis)" },
  { bn: "কৃমি", en: "Worms" },
] as const;

/** One cow, as turnover reads her. */
export interface CowStay {
  /** When she first calved, or her Lactation began for one on the opening register: a cow from then. Nothing for a
   *  heifer who has not calved. */
  cowFrom: Date | null;
  /** When she calved her first calf, Lactation one: a heifer joining the milking herd. */
  firstCalvedAt: Date | null;
  /** Which Side she stood on when; her Side today throughout where the farm has none. */
  side: "dairy" | "fattening";
  sides: readonly SideStretch[];
  arrivedAt: Date;
  /** How she left the farm, where she has. */
  left: { how: "died" | "culled" | "sold" | "lost"; at: Date } | null;
}

export interface DairyTurnover {
  /** Cows kept a year, one cow for a year being one. */
  cowYears: number;
  died: number;
  culled: number;
  /** Sold off the Dairy side: to a butcher, a trader, another farm. */
  sold: number;
  /** Walked across to Fattening, for an Eid. */
  crossed: number;
  lost: number;
  /** Every way out, for every hundred cows kept a year; nothing with no cows kept. */
  leftPerHundred: number | null;
  /** Culled, sold or crossed — the farm's own choice to let her go — for every hundred cows kept a year. */
  letGoPerHundred: number | null;
  /** Heifers that calved their first in the stretch, joining the milking herd. */
  replacements: number;
  replacementsPerHundred: number | null;
}

const later = (a: Date, b: Date) => (a > b ? a : b);
const earlier = (a: Date, b: Date) => (a < b ? a : b);
const within = (at: Date, from: Date, until: Date) => at >= from && at < until;
const perHundred = (count: number, days: number): number | null =>
  days > 0
    ? Math.round((count / (days / DAYS_A_YEAR)) * HUNDRED * 10) / 10
    : null;

/** Her stretches by Side, oldest first; her Side today throughout where the farm has none. */
const stretchesOf = (cow: CowStay): readonly SideStretch[] =>
  cow.sides.length > 0
    ? cow.sides.toSorted((a, b) => a.from.getTime() - b.from.getTime())
    : [{ side: cow.side, from: cow.arrivedAt, until: cow.left?.at ?? null }];

/** The Side she stood on at a moment. */
const sideAt = (
  stretches: readonly SideStretch[],
  at: Date,
  fallback: string
) => stretches.findLast((one) => one.from <= at)?.side ?? fallback;

/** Her days on the Dairy side as a cow in `start`–`end`. */
const cowDaysOf = (
  stretches: readonly SideStretch[],
  start: Date,
  end: Date
): number => {
  let days = 0;
  for (const stretch of stretches) {
    const a = later(stretch.from, start);
    const b = earlier(stretch.until ?? end, end);
    if (stretch.side === "dairy" && b > a) {
      days += (b.getTime() - a.getTime()) / DAY_MS;
    }
  }
  return days;
};

/** Times she crossed from Dairy to Fattening as a cow in the stretch: a Fattening stretch right after a Dairy one. */
const crossingsOf = (
  stretches: readonly SideStretch[],
  cowFrom: Date,
  from: Date,
  until: Date
): number =>
  stretches.filter(
    (stretch, index) =>
      stretch.side === "fattening" &&
      stretches[index - 1]?.side === "dairy" &&
      stretch.from >= cowFrom &&
      within(stretch.from, from, until)
  ).length;

/** How she left the milking herd in the stretch, where she left it as a cow from the Dairy side. */
const leftTheHerd = (
  cow: CowStay & { cowFrom: Date },
  stretches: readonly SideStretch[],
  from: Date,
  until: Date
): CowStay["left"] => {
  const { left } = cow;
  return left &&
    left.at >= cow.cowFrom &&
    within(left.at, from, until) &&
    sideAt(stretches, left.at, cow.side) === "dairy"
    ? left
    : null;
};

/** How the dairy herd turned over in `from`–`until`. */
export const dairyTurnover = (
  cows: readonly CowStay[],
  { from, until }: { from: Date; until: Date }
): DairyTurnover => {
  let days = 0;
  const counts = { died: 0, culled: 0, sold: 0, crossed: 0, lost: 0 };
  let replacements = 0;
  for (const cow of cows) {
    if (cow.firstCalvedAt && within(cow.firstCalvedAt, from, until)) {
      replacements += 1;
    }
    const { cowFrom } = cow;
    if (!cowFrom) {
      continue;
    }
    const stretches = stretchesOf(cow);
    days += cowDaysOf(
      stretches,
      later(cowFrom, from),
      earlier(cow.left?.at ?? until, until)
    );
    counts.crossed += crossingsOf(stretches, cowFrom, from, until);
    const left = leftTheHerd({ ...cow, cowFrom }, stretches, from, until);
    if (left) {
      counts[left.how] += 1;
    }
  }
  const out =
    counts.died + counts.culled + counts.sold + counts.crossed + counts.lost;
  return {
    cowYears: Math.round((days / DAYS_A_YEAR) * 10) / 10,
    ...counts,
    leftPerHundred: perHundred(out, days),
    letGoPerHundred: perHundred(
      counts.culled + counts.sold + counts.crossed,
      days
    ),
    replacements,
    replacementsPerHundred: perHundred(replacements, days),
  };
};

/** One Diagnosis as the sickness figures read it: the Side she stood on that day, and the disease as the Vet wrote it. */
export interface DiagnosisSeen {
  side: "dairy" | "fattening";
  disease: string;
  diseaseEn?: string | null;
}

/** The words that name mastitis, in Bangla, in its Bangla spelling of the English, and in English. */
const MASTITIS_WORDS = /ওলান প্রদাহ|ম্যাস্টাইটিস|mastitis/iu;

/** Whether a Diagnosis names mastitis, however the Vet put it: "clinical mastitis", "ওলান প্রদাহ", the list's word. */
const namesMastitis = (one: DiagnosisSeen): boolean =>
  MASTITIS_WORDS.test(one.disease) || MASTITIS_WORDS.test(one.diseaseEn ?? "");

export interface Sickness {
  /** Diagnoses for every hundred head kept a year, by Side; nothing where none was kept. */
  dairyPerHundred: number | null;
  fatteningPerHundred: number | null;
  /** Clinical mastitis for every hundred cows kept a year. */
  mastitisPerHundredCows: number | null;
  /** What was found, the commonest first. */
  diseases: { disease: string; count: number }[];
}

/** How often the farm's animals were found sick in the stretch, over the head and cows it kept. */
export const sicknessOf = (
  diagnoses: readonly DiagnosisSeen[],
  kept: { dairyHeadYears: number; fatteningHeadYears: number; cowYears: number }
): Sickness => {
  const rate = (count: number, years: number) =>
    years > 0 ? Math.round((count / years) * HUNDRED * 10) / 10 : null;
  const byDisease = new Map<string, number>();
  for (const one of diagnoses) {
    const disease = one.disease.trim();
    byDisease.set(disease, (byDisease.get(disease) ?? 0) + 1);
  }
  return {
    dairyPerHundred: rate(
      diagnoses.filter((one) => one.side === "dairy").length,
      kept.dairyHeadYears
    ),
    fatteningPerHundred: rate(
      diagnoses.filter((one) => one.side === "fattening").length,
      kept.fatteningHeadYears
    ),
    mastitisPerHundredCows: rate(
      diagnoses.filter((one) => one.side === "dairy" && namesMastitis(one))
        .length,
      kept.cowYears
    ),
    diseases: [...byDisease.entries()]
      .map(([disease, count]) => ({ disease, count }))
      .toSorted(
        (a, b) => b.count - a.count || a.disease.localeCompare(b.disease)
      ),
  };
};
