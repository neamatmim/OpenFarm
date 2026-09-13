/**
 * The farm's own clock. Asia/Dhaka has no daylight saving; a Farm Parameter later.
 *
 * Here in the domain rather than in the API, because a day filter, a schedule time, a
 * certificate's expiry and a Target Window on a screen all mean "the farm's own day", and they
 * must mean the same one on the server and in the browser both.
 */
export const FARM_UTC_OFFSET_MINUTES = 6 * 60;
const FARM_UTC_OFFSET = "+06:00";
const MINUTE_MS = 60_000;

/** The instant a farm-local day ("YYYY-MM-DD") begins. */
export const startOfFarmDay = (day: string): Date =>
  new Date(`${day}T00:00:00${FARM_UTC_OFFSET}`);

/** An instant on the farm's own clock, as an ISO string: what the day and the time of day read off. */
const onTheFarmClock = (at: Date): string =>
  new Date(at.getTime() + FARM_UTC_OFFSET_MINUTES * MINUTE_MS).toISOString();

/** The farm's own day an instant falls on. Four in the morning UTC is already today in Savar,
 *  and a farm that reads its calendar in UTC buys an animal on the wrong day twice a year. */
export const farmDayOf = (at: Date): string =>
  onTheFarmClock(at).slice(0, "YYYY-MM-DD".length);

/** The farm's own time of day an instant falls at, as "HH:MM" — the session a milking belongs to, as
 *  the shed names it. */
export const farmTimeOf = (at: Date): string =>
  onTheFarmClock(at).slice("YYYY-MM-DDT".length, "YYYY-MM-DDTHH:MM".length);

const DAY_MS = 24 * 60 * MINUTE_MS;

/** The farm days from `from` to `to`, both included, as the instants that bound them. */
export const farmDaysBetween = (
  from: string,
  to: string
): { from: Date; until: Date } => ({
  from: startOfFarmDay(from),
  until: new Date(startOfFarmDay(to).getTime() + DAY_MS),
});
