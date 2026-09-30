/**
 * What the farm loses in grown animals — past weaning, on either Side — over a stretch of days: how many died, of what,
 * and the rate that says whether that is many, deaths for every hundred head kept a year. Culls are counted apart: the
 * farm chose them, and a rate that mixed them in would read a good culling year as a bad health year. Calves before
 * weaning are the calf-loss figure's.
 */

import type { CalfCause } from "./calf-losses";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_A_YEAR = 365;
const HUNDRED = 100;

/**
 * What grown cattle most often die of on a Bangladeshi farm, offered on the death form for an animal past weaning — the
 * everyday killers and the diseases the farm must report — with "not known" for the morning she is simply found dead.
 * Written in Bangla whoever picks one, so each cause is counted once rather than once per language. The Vet may be
 * asked to look it over; "another cause" is still typed freely.
 */
export const ADULT_DEATH_CAUSES = [
  { bn: "পেট ফাঁপা", en: "Bloat" },
  { bn: "দুধ জ্বর", en: "Milk fever" },
  { bn: "ওলান প্রদাহ", en: "Mastitis" },
  { bn: "নিউমোনিয়া", en: "Pneumonia" },
  { bn: "প্রসবে জটিলতা", en: "Calving trouble" },
  { bn: "ক্ষুরা রোগ", en: "Foot-and-mouth disease" },
  { bn: "গলাফোলা", en: "Haemorrhagic septicaemia" },
  { bn: "দুর্ঘটনা বা আঘাত", en: "Accident or injury" },
  { bn: "কারণ জানা যায়নি", en: "Cause not known" },
] as const;

/** One animal as the rate reads her: her Side, when she came to be grown here, when she left, and how she died. */
export interface HeadRecord {
  side: "dairy" | "fattening";
  /** When she was born, where the farm knows; nothing for one bought in grown or on the opening register. */
  bornAt: Date | null;
  /** When she came onto the farm: her Intake, her birth, or the day she was registered. */
  arrivedAt: Date;
  /** When she left the farm by any way out; nothing while she is here. */
  leftAt: Date | null;
  /** Her death or cull, where she had one. */
  death: { kind: "died" | "culled"; at: Date; cause: string } | null;
}

export interface SideDeaths {
  died: number;
  culled: number;
  /** Head kept over the stretch, a year of one animal being one: what the rate is read over. */
  headYears: number;
  /** Deaths for every hundred head kept a year; nothing where no grown animal was kept. */
  perHundred: number | null;
}

export interface AdultDeaths {
  dairy: SideDeaths;
  fattening: SideDeaths;
  /** What the grown animals that died died of, the commonest first. */
  causes: CalfCause[];
}

const later = (a: Date, b: Date) => (a > b ? a : b);
const earlier = (a: Date, b: Date) => (a < b ? a : b);

/** From when she counts as grown here: her arrival, or her weaning age if she was born later than that. */
const grownFrom = (one: HeadRecord, weaningDays: number): Date =>
  one.bornAt
    ? later(
        one.arrivedAt,
        new Date(one.bornAt.getTime() + weaningDays * DAY_MS)
      )
    : one.arrivedAt;

/** A Side before any animal is counted. */
const blank = (): SideDeaths & { days: number } => ({
  died: 0,
  culled: 0,
  headYears: 0,
  perHundred: null,
  days: 0,
});

/** A Side counted: its days kept as head-years, and deaths for every hundred of them. */
const finished = ({ days, ...side }: SideDeaths & { days: number }) => {
  const headYears = Math.round((days / DAYS_A_YEAR) * 10) / 10;
  return {
    ...side,
    headYears,
    perHundred:
      days > 0
        ? Math.round((side.died / (days / DAYS_A_YEAR)) * HUNDRED * 10) / 10
        : null,
  };
};

/** The grown animals of `from`–`until`, counted by Side. */
export const adultDeaths = (
  herd: readonly HeadRecord[],
  { from, until, weaningDays }: { from: Date; until: Date; weaningDays: number }
): AdultDeaths => {
  const sides = { dairy: blank(), fattening: blank() };
  const byCause = new Map<string, number>();
  for (const one of herd) {
    const grown = grownFrom(one, weaningDays);
    const start = later(grown, from);
    const end = earlier(one.leftAt ?? until, until);
    const side = sides[one.side];
    if (end > start) {
      side.days += (end.getTime() - start.getTime()) / DAY_MS;
    }
    const { death } = one;
    const inTheStretch =
      death !== null &&
      death.at >= from &&
      death.at < until &&
      death.at >= grown;
    if (!(death && inTheStretch)) {
      continue;
    }
    if (death.kind === "culled") {
      side.culled += 1;
      continue;
    }
    side.died += 1;
    const cause = death.cause.trim() || "—";
    byCause.set(cause, (byCause.get(cause) ?? 0) + 1);
  }
  return {
    dairy: finished(sides.dairy),
    fattening: finished(sides.fattening),
    causes: [...byCause.entries()]
      .map(([cause, count]) => ({ cause, count }))
      .toSorted((a, b) => b.count - a.count || a.cause.localeCompare(b.cause)),
  };
};
