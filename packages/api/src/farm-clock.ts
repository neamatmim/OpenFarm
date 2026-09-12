import { z } from "zod";

/** The farm's clock. Asia/Dhaka has no daylight saving; a farm parameter later.
 *
 *  One place, because three had begun to grow: a day filter, a schedule time and a certificate
 *  date all mean "the farm's own day", and they must mean the same one. */
export const FARM_UTC_OFFSET_MINUTES = 6 * 60;
const FARM_UTC_OFFSET = "+06:00";

/** The instant a farm-local day ("YYYY-MM-DD") begins. */
export const startOfFarmDay = (day: string): Date =>
  new Date(`${day}T00:00:00${FARM_UTC_OFFSET}`);

/** A day as a certificate prints it and a date field holds it. */
export const farmDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "YYYY-MM-DD");
