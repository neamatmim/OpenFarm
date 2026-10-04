import { z } from "zod";

/** A day as a certificate prints it, a calendar names it, and a date field holds it. The farm's
 *  clock itself lives in the domain, where the browser can reach it too. */
export const farmDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "YYYY-MM-DD");

/** A month as the farm keeps one, "YYYY-MM": a year and a month of it, January to December. */
export const farmMonth = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, "YYYY-MM");

/** A Target Window as a form says it: its first day and its last, in order. */
export const targetWindowInput = z
  .object({ start: farmDay, end: farmDay })
  .refine((one) => one.start <= one.end, {
    message: "A Target Window needs its days in order",
  });
