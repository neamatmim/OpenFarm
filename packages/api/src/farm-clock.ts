import { z } from "zod";

/** The farm's clock. Asia/Dhaka has no daylight saving; a farm parameter later.
 *
 *  One place, because three had begun to grow: a day filter, a schedule time and a certificate
 *  date all mean "the farm's own day", and they must mean the same one. */
export const FARM_UTC_OFFSET_MINUTES = 6 * 60;
const FARM_UTC_OFFSET = "+06:00";

const MINUTE_MS = 60_000;

/** The instant a farm-local day ("YYYY-MM-DD") begins. */
export const startOfFarmDay = (day: string): Date =>
  new Date(`${day}T00:00:00${FARM_UTC_OFFSET}`);

/** The farm's own day an instant falls on. Four in the morning UTC is already today in Savar,
 *  and a farm that reads its calendar in UTC buys an animal on the wrong day twice a year. */
export const farmDayOf = (at: Date): string =>
  new Date(at.getTime() + FARM_UTC_OFFSET_MINUTES * MINUTE_MS)
    .toISOString()
    .slice(0, 10);

/** A day as a certificate prints it and a date field holds it. */
export const farmDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "YYYY-MM-DD");
