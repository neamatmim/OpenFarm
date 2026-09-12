import { z } from "zod";

/** A day as a certificate prints it, a calendar names it, and a date field holds it. The farm's
 *  clock itself lives in the domain, where the browser can reach it too. */
export const farmDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "YYYY-MM-DD");
