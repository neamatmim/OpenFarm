import type { DoseRoute } from "@OpenFarm/domain";
import { farmDayOf, withdrawalEndsAt } from "@OpenFarm/domain";

import type { Db, Register } from "./register";
import { NOTHING } from "./register";

/** One dose on the treatment register, its days farm days and its route the word the Vet chose. */
export interface TreatmentRow {
  id: string;
  givenOn: string;
  tagNumber: string;
  diagnosis: string | null;
  drug: string;
  dose: string | null;
  route: DoseRoute | null;
  course: string | null;
  givenBy: string | null;
  prescribedBy: string | null;
  milkClearOn: string | null;
  meatClearOn: string | null;
}

/**
 * Every dose given in a period, oldest first: the animal, what was wrong with her, the drug, dose and route,
 * which dose of the course it was, who gave it, the Vet who prescribed it, and when her milk and meat were
 * clear of it. A campaign's dose, which nobody prescribed, carries no diagnosis, dose, route or prescriber.
 */
const treatmentsBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<TreatmentRow[]> => {
  const doses = await db.query.treatment.findMany({
    where: { farmId, givenAt: { gte: from, lt: until } },
    columns: { id: true, givenAt: true, number: true },
    with: {
      animal: { columns: { tagNumber: true } },
      product: {
        columns: {
          nameBn: true,
          milkWithdrawalDays: true,
          meatWithdrawalDays: true,
        },
      },
      giver: { columns: { name: true } },
      prescription: {
        columns: { dose: true, route: true, days: true, times: true },
        with: {
          diagnosis: { columns: { disease: true } },
          vet: { columns: { name: true } },
        },
      },
    },
    orderBy: { givenAt: "asc", id: "asc" },
  });
  return doses.flatMap((one) => {
    if (!one.givenAt) {
      return [];
    }
    const { givenAt, product, prescription } = one;
    const clearOn = (days: number | null) =>
      days === null ? null : farmDayOf(withdrawalEndsAt(givenAt, days));
    return [
      {
        id: one.id,
        givenOn: farmDayOf(givenAt),
        tagNumber: one.animal.tagNumber,
        diagnosis: prescription?.diagnosis?.disease ?? null,
        drug: product.nameBn,
        dose: prescription?.dose ?? null,
        route: prescription?.route ?? null,
        course: prescription
          ? `${one.number}/${prescription.days * prescription.times.length}`
          : null,
        givenBy: one.giver?.name ?? null,
        prescribedBy: prescription?.vet?.name ?? null,
        milkClearOn: clearOn(product.milkWithdrawalDays),
        meatClearOn: clearOn(product.meatWithdrawalDays),
      },
    ];
  });
};

/** Thirty days of treatments, as an inspector asks. The day it is asked on is the first of them. */
const LOOK_BACK_DAYS = 30;

/**
 * R4, the treatment register: every dose in a period — thirty days back from today unless asked — in the DLS
 * guideline's column order: the date, the animal, the diagnosis, the drug, the dose and route, which dose of
 * the course, who gave it, the prescribing Vet, and when the milk and the meat were clear. What an inspector
 * and a slaughter vet ask for first.
 */
export const TREATMENT_REGISTER: Register<TreatmentRow> = {
  name: "treatment_register",
  looksBack: { months: 0, days: 1 - LOOK_BACK_DAYS },
  read: treatmentsBetween,
  paper: {
    title: { bn: "চিকিৎসার রেজিস্টার", en: "Treatment register" },
    none: {
      bn: "এই সময়ে কোনো চিকিৎসা হয়নি",
      en: "No treatments in this period",
    },
    heading: (row, say) => `${say.day(row.givenOn)} · ${row.tagNumber}`,
  },
  columns: [
    { csv: { header: "date", value: (row) => row.givenOn } },
    { csv: { header: "tag", value: (row) => row.tagNumber } },
    {
      paper: {
        bn: "রোগ",
        en: "Diagnosis",
        said: (row) => row.diagnosis ?? NOTHING,
      },
      csv: { header: "diagnosis", value: (row) => row.diagnosis },
    },
    {
      paper: { bn: "ওষুধ", en: "Drug", said: (row) => row.drug },
      csv: { header: "drug", value: (row) => row.drug },
    },
    {
      paper: { bn: "ডোজ", en: "Dose", said: (row) => row.dose ?? NOTHING },
      csv: { header: "dose", value: (row) => row.dose },
    },
    {
      paper: {
        bn: "পথ",
        en: "Route",
        said: (row, say) =>
          row.route ? say.both(`route.${row.route}`) : NOTHING,
      },
      csv: { header: "route", value: (row) => row.route },
    },
    {
      paper: { bn: "কোর্স", en: "Course", said: (row) => row.course ?? NOTHING },
      csv: { header: "course", value: (row) => row.course },
    },
    {
      paper: {
        bn: "যিনি দিয়েছেন",
        en: "Given by",
        said: (row) => row.givenBy ?? NOTHING,
      },
      csv: { header: "given_by", value: (row) => row.givenBy },
    },
    {
      paper: {
        bn: "প্রেসক্রিপশন",
        en: "Prescribed by",
        said: (row) => row.prescribedBy ?? NOTHING,
      },
      csv: { header: "prescribed_by", value: (row) => row.prescribedBy },
    },
    {
      paper: {
        bn: "দুধ মুক্ত",
        en: "Milk clear",
        said: (row, say) =>
          row.milkClearOn ? say.day(row.milkClearOn) : NOTHING,
      },
      csv: { header: "milk_withdrawal_ends", value: (row) => row.milkClearOn },
    },
    {
      paper: {
        bn: "মাংস মুক্ত",
        en: "Meat clear",
        said: (row, say) =>
          row.meatClearOn ? say.day(row.meatClearOn) : NOTHING,
      },
      csv: { header: "meat_withdrawal_ends", value: (row) => row.meatClearOn },
    },
  ],
  said: (rows) => ({ doses: rows.length }),
};
