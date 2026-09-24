import type { TargetWindow } from "./fattening";
import { addDays } from "./fattening";

/**
 * Eid-ul-Adha, as Bangladesh expects to keep it.
 *
 * A table and not a calculation, because the day is not calculable: it is 10 Dhul Hijjah, fixed
 * for Bangladesh by the moon sighting committee, and typically one day after Saudi Arabia. These
 * are the expected dates, which is all anyone has until the announcement — so the farm writes the
 * announced day in once it is made, and that day stands in for the one expected.
 *
 * The farm sells into this market every year, so the table is kept a decade ahead: an animal
 * bought today is fed towards a date, and a farm that cannot name the date cannot project to it.
 * Past its end the Umm al-Qura calendar gives a guess, said to be one.
 */
export const EID_UL_ADHA = [
  "2026-05-28",
  "2027-05-17",
  "2028-05-06",
  "2029-04-25",
  "2030-04-14",
  "2031-04-03",
  "2032-03-23",
  "2033-03-12",
  "2034-03-02",
  "2035-02-19",
  "2036-02-08",
] as const;

/** Qurbani runs the tenth, eleventh and twelfth of Dhul Hijjah: three days of selling, not one. */
export const QURBANI_DAYS = 3;

/**
 * How sure the farm is of an Eid's day: the committee announced it, the table expects it, or — past the
 * table — the calendar guesses it.
 */
export const EID_BASES = ["announced", "expected", "estimated"] as const;
export type EidBasis = (typeof EID_BASES)[number];

/** An Eid's three days of Qurbani, and how sure the farm is of them. */
export interface EidWindow extends TargetWindow {
  basis: EidBasis;
}

/** Two days this close name the same Eid — the moon is seen a day early or late, never a week — and the next
 *  Eid is 354 days on. */
const SAME_EID_DAYS = 3;

/** Bangladesh usually sights the moon a day after Saudi Arabia, whose calendar Umm al-Qura is. */
const BANGLADESH_LAG_DAYS = 1;

/** The longest a year of the Hijri calendar runs, so a search for the next Eid is bound to meet one. */
const HIJRI_YEAR_DAYS_AT_MOST = 356;

/** One Eid to the next: a Hijri year is 354 or 355 days. */
const EIDS_APART_DAYS = 354;

/** How many known Eids the calendar's search may step past before it gives up. */
const SEARCH_STEPS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysApart = (one: string, other: string): number =>
  Math.round(
    (Date.parse(`${one}T00:00:00Z`) - Date.parse(`${other}T00:00:00Z`)) / DAY_MS
  );

/** Whether two days are the same Eid named twice: the one expected and the one announced. */
export const isSameEid = (one: string, other: string): boolean =>
  Math.abs(daysApart(one, other)) <= SAME_EID_DAYS;

/** The three days of Qurbani from an Eid's first. */
export const qurbaniFrom = (day: string): TargetWindow => ({
  start: day,
  end: addDays(day, QURBANI_DAYS - 1),
});

/** The Umm al-Qura calendar, where the runtime has it; nothing where it does not, so a guess is never made from
 *  the Gregorian calendar dressed up as another. */
const umalqura = ((): Intl.DateTimeFormat | null => {
  try {
    const format = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
    return format.resolvedOptions().calendar === "islamic-umalqura"
      ? format
      : null;
  } catch {
    return null;
  }
})();

const isTenthOfDhulHijjah = (format: Intl.DateTimeFormat, day: string) => {
  const parts = format.formatToParts(new Date(`${day}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((one) => one.type === type)?.value;
  return part("month") === "12" && part("day") === "10";
};

const guessed = new Map<string, string | null>();

/**
 * The first Eid on or after `day` as the Umm al-Qura calendar puts it, a day later for Bangladesh: a guess, for the
 * years past the table, and never better than one. Null where the runtime has no such calendar.
 */
export const eidByTheCalendar = (day: string): string | null => {
  const format = umalqura;
  if (!format) {
    return null;
  }
  const known = guessed.get(day);
  if (known !== undefined) {
    return known;
  }
  let found: string | null = null;
  for (let ahead = 0; ahead <= HIJRI_YEAR_DAYS_AT_MOST; ahead += 1) {
    const inSaudiArabia = addDays(day, ahead - BANGLADESH_LAG_DAYS);
    if (isTenthOfDhulHijjah(format, inSaudiArabia)) {
      found = addDays(inSaudiArabia, BANGLADESH_LAG_DAYS);
      break;
    }
  }
  guessed.set(day, found);
  return found;
};

/** The first Eid on or after `day` the calendar gives that is not one the farm already knows: the one it is
 *  standing in, or last year's announced a day off, is passed over for the one after. */
const guessAfter = (day: string, known: readonly string[]): string | null => {
  let from = day;
  // One known Eid passed over, perhaps a second a day either side: never more than a couple of steps.
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const guess = eidByTheCalendar(from);
    if (!guess) {
      return null;
    }
    if (!known.some((one) => isSameEid(one, guess))) {
      return guess;
    }
    from = addDays(guess, SAME_EID_DAYS + 1);
  }
  return null;
};

/**
 * The day the farm expected the Eid near `day` on, before anybody announced it: the table's, or past the table the
 * calendar's. Null for a day that is no Eid at all — a year typed wrong.
 */
export const expectedEidNear = (day: string): string | null => {
  const listed = EID_UL_ADHA.find((one) => isSameEid(one, day));
  if (listed) {
    return listed;
  }
  const guess = eidByTheCalendar(addDays(day, -SAME_EID_DAYS));
  return guess && isSameEid(guess, day) ? guess : null;
};

/**
 * The Eid the farm is feeding towards from `today`: the next one, or the one it is standing in.
 *
 * An animal bought on the second day of Qurbani is not being fed for a market that closes
 * tomorrow, but the farm is still in that market — so a window is current until its last day is
 * past, and only then does the next year's become the default.
 *
 * A day the farm has written in as announced stands in for the one the table expected. Past the table, or with a
 * year missing from it, the calendar's guess — said to be a guess. Null only where there is no calendar to ask.
 */
export const nextEidWindow = (
  today: string,
  announced: readonly string[] = []
): EidWindow | null => {
  const known = [
    ...announced.map((day) => ({ day, basis: "announced" as const })),
    ...EID_UL_ADHA.filter(
      (day) => !announced.some((one) => isSameEid(one, day))
    ).map((day) => ({ day, basis: "expected" as const })),
  ].toSorted((one, other) => one.day.localeCompare(other.day));
  const windowOf = (one: { day: string; basis: EidBasis }): EidWindow => ({
    ...qurbaniFrom(one.day),
    basis: one.basis,
  });
  const ahead = known.map(windowOf).find((one) => one.end >= today);
  // Nearer than a year's Eids apart, what the farm knows is the next Eid, and the calendar has nothing to add.
  if (ahead && daysApart(ahead.start, today) < EIDS_APART_DAYS) {
    return ahead;
  }
  const guess = guessAfter(
    addDays(today, 1 - QURBANI_DAYS),
    known.map((one) => one.day)
  );
  if (!(ahead && guess)) {
    return (
      ahead ?? (guess ? windowOf({ day: guess, basis: "estimated" }) : null)
    );
  }
  return guess < ahead.start
    ? windowOf({ day: guess, basis: "estimated" })
    : ahead;
};
