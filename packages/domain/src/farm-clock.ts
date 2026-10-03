import { farmTimeZone } from "@OpenFarm/i18n";

/**
 * The farm's own clock: the wall clock of the time zone the farm is in (ADR 0013), Asia/Dhaka unless its server says
 * otherwise. Read off the zone itself rather than a fixed offset, so a farm whose clocks change for the summer still
 * starts each day at its own midnight.
 *
 * Here in the domain rather than in the API, because a day filter, a schedule time, a
 * certificate's expiry and a Target Window on a screen all mean "the farm's own day", and they
 * must mean the same one on the server and in the browser both.
 */
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const wallClocks = new Map<string, Intl.DateTimeFormat>();

/** A zone's wall clock, made once: a formatter is dear to make, and the farm's day is read for every record. */
const wallClockIn = (zone: string): Intl.DateTimeFormat => {
  const made = wallClocks.get(zone);
  if (made) {
    return made;
  }
  const clock = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  wallClocks.set(zone, clock);
  return clock;
};

/** What the farm's wall clock reads at an instant, as "YYYY-MM-DDTHH:MM:SS": what the day and the time of day read
 *  off. */
const onTheFarmClock = (at: Date): string => {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of wallClockIn(farmTimeZone()).formatToParts(at)) {
    part[type] = value;
  }
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}:${part.second}`;
};

/** How far the farm's wall clock is ahead of UTC at an instant, in milliseconds. */
const aheadOfUtcAt = (instant: number): number => {
  const toTheSecond = instant - (((instant % 1000) + 1000) % 1000);
  return Date.parse(`${onTheFarmClock(new Date(toTheSecond))}Z`) - toTheSecond;
};

/**
 * The instant a farm day's time of day ("HH:MM") falls at. The wall clock is read as UTC and moved back by how far the
 * farm is ahead there — asked twice, because the first guess may land on the other side of a change of the clocks.
 */
export const atFarmTime = (day: string, time: string): Date => {
  const wall = Date.parse(`${day}T${time}:00Z`);
  const guess = wall - aheadOfUtcAt(wall);
  return new Date(wall - aheadOfUtcAt(guess));
};

/** The instant a farm-local day ("YYYY-MM-DD") begins. */
export const startOfFarmDay = (day: string): Date => atFarmTime(day, "00:00");

/** The calendar day after `day`, whatever the clocks did in between. */
const dayAfter = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** The farm's own day an instant falls on. Four in the morning UTC is already today in Savar,
 *  and a farm that reads its calendar in UTC buys an animal on the wrong day twice a year. */
export const farmDayOf = (at: Date): string =>
  onTheFarmClock(at).slice(0, "YYYY-MM-DD".length);

/** The farm's own time of day an instant falls at, as "HH:MM" — the session a milking belongs to, as
 *  the shed names it. */
export const farmTimeOf = (at: Date): string =>
  onTheFarmClock(at).slice("YYYY-MM-DDT".length, "YYYY-MM-DDTHH:MM".length);

/** How many farm days `to` is after `from`: whole days, fewer than none when it is before. Counted on the calendar,
 *  so a day of 23 hours or 25 is one day all the same. */
export const farmDaysApart = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );

/** The farm days from `from` to `to`, both included, as the instants that bound them. */
export const farmDaysBetween = (
  from: string,
  to: string
): { from: Date; until: Date } => ({
  from: startOfFarmDay(from),
  until: startOfFarmDay(dayAfter(to)),
});
