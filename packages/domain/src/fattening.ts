/**
 * Eid-ul-Adha, as Bangladesh expects to keep it.
 *
 * A table and not a calculation, because the day is not calculable: it is 10 Dhul Hijjah, fixed
 * for Bangladesh by the moon sighting committee, and typically one day after Saudi Arabia. These
 * are the expected dates, which is all anyone has until the announcement — so the Manager may
 * move any animal's Target Window, and once the year's date is announced these become history
 * rather than a guess.
 *
 * The farm sells into this market every year, so the table is kept a decade ahead: an animal
 * bought today is fed towards a date, and a farm that cannot name the date cannot project to it.
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** The period the farm intends to sell an Animal in. Days, as a calendar names them. */
export interface TargetWindow {
  start: string;
  end: string;
}

/** `day` plus `days`, as "YYYY-MM-DD". Read as UTC throughout: a calendar day plus two is the
 *  same calendar day plus two whatever clock the reader keeps. */
const addDays = (day: string, days: number): string => {
  const at = new Date(`${day}T00:00:00Z`);
  return new Date(at.getTime() + days * DAY_MS).toISOString().slice(0, 10);
};

/**
 * The Eid the farm is feeding towards from `today`: the next one, or the one it is standing in.
 *
 * An animal bought on the second day of Qurbani is not being fed for a market that closes
 * tomorrow, but the farm is still in that market — so a window is current until its last day is
 * past, and only then does the next year's become the default.
 *
 * Null once the table runs out, which is a reason to extend it rather than to guess.
 */
export const nextEidWindow = (today: string): TargetWindow | null => {
  for (const day of EID_UL_ADHA) {
    const end = addDays(day, QURBANI_DAYS - 1);
    if (end >= today) {
      return { start: day, end };
    }
  }
  return null;
};

/**
 * What a beast can plausibly do between two weighings.
 *
 * Not a Farm Parameter: these are facts about cattle rather than about this farm. A fattening
 * bull on good feed gains about a kilo a day and exceptionally two; three is a scale read wrong,
 * a tag read wrong, or two animals confused. Loss is allowed more room in one direction than gain
 * is in the other, because an animal can go off its feed for a fortnight and a sick one can drop
 * fast, and the farm would rather be told that than argued with.
 */
export const PLAUSIBLE_DAILY_GAIN_KG = 2.5;
export const PLAUSIBLE_DAILY_LOSS_KG = 3;

/** Below this, two readings are too close together in time for a daily rate to mean anything —
 *  two weighings on the same morning differ by what the animal drank. */
const RATE_NEEDS_DAYS = 1;

/**
 * Why a reading should be queried before the farm accepts it, or null when it is unremarkable.
 *
 * Only the farm's own records can tell: a phone that has not synced does not know what she
 * weighed a fortnight ago, so the question is asked where her history is.
 */
export const implausibleChange = (
  last: { weightKg: number; weighedAt: Date } | null,
  now: { weightKg: number; weighedAt: Date }
): { dailyKg: number; days: number; lastKg: number } | null => {
  if (!last) {
    return null;
  }
  const days =
    (now.weighedAt.getTime() - last.weighedAt.getTime()) /
    (24 * 60 * 60 * 1000);
  if (days < RATE_NEEDS_DAYS) {
    return null;
  }
  const dailyKg = (now.weightKg - last.weightKg) / days;
  const impossible =
    dailyKg > PLAUSIBLE_DAILY_GAIN_KG || dailyKg < -PLAUSIBLE_DAILY_LOSS_KG;
  return impossible ? { dailyKg, days, lastKg: last.weightKg } : null;
};
