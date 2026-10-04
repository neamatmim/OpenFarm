/**
 * What a piece of work raised about one animal says about her, wherever the work is shown: her Tag Number, and for
 * a dose the drug, how much, how it goes in and which dose of the course it is. A dose's work is one tick, not a Step
 * repeated per animal, so without this the phone says "give the dose" and a Pen — and the dose goes to whichever cow
 * is nearest.
 */

import type { ROUTES } from "@OpenFarm/db/schema/health";

/** The relations a work query reads for it. */
export const ABOUT_HER = {
  animal: { columns: { tagNumber: true } },
  dose: {
    columns: { number: true },
    with: {
      product: { columns: { nameBn: true, nameEn: true } },
      prescription: {
        columns: { dose: true, route: true, days: true, times: true },
      },
    },
  },
} as const;

interface ReadAboutHer {
  animal: { tagNumber: string } | null;
  dose: {
    number: number;
    product: { nameBn: string; nameEn: string | null };
    prescription: {
      dose: string;
      route: (typeof ROUTES)[number];
      days: number;
      times: string[];
    } | null;
  } | null;
}

/** The dose as the phone shows it: number of how many, the drug in both languages, the Vet's amount and route. */
const doseSaid = (dose: NonNullable<ReadAboutHer["dose"]>) =>
  dose.prescription
    ? {
        number: dose.number,
        of: dose.prescription.days * dose.prescription.times.length,
        drug: { bn: dose.product.nameBn, en: dose.product.nameEn },
        amount: dose.prescription.dose,
        route: dose.prescription.route,
      }
    : null;

/** What the work says about her, from a row read with `ABOUT_HER`. */
export const aboutHer = (row: ReadAboutHer) => ({
  animal: row.animal ? { tagNumber: row.animal.tagNumber } : null,
  dose: row.dose ? doseSaid(row.dose) : null,
});
