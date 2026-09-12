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
