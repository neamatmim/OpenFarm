import { farmDayOf } from "@OpenFarm/domain";

import type { Db, Register } from "./register";
import { A_YEAR_BACK, NOTHING } from "./register";

/** One vaccine dose on the vaccination register, its day a farm day. */
export interface VaccinationRow {
  id: string;
  tagNumber: string;
  vaccine: string;
  givenOn: string;
  /** The vial's Lot Number: the dose's own, or its Campaign's. Null for a dose recorded before the product
   *  was marked a vaccine. */
  lotNumber: string | null;
  givenBy: string | null;
}

/**
 * Every dose of a product the Vet has marked a vaccine, given in a period, oldest first: the animal, the vaccine,
 * the day, the Lot Number — the dose's own, or else its Campaign's — and who gave it. A product marked a
 * vaccine after it was given still puts its doses here, with no lot if nobody wrote one.
 */
const vaccinationsBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<VaccinationRow[]> => {
  const doses = await db.query.treatment.findMany({
    where: {
      farmId,
      givenAt: { gte: from, lt: until },
      product: { vaccine: true },
    },
    columns: { id: true, givenAt: true, lotNumber: true },
    with: {
      animal: { columns: { tagNumber: true } },
      product: { columns: { nameBn: true } },
      giver: { columns: { name: true } },
      instance: {
        columns: {},
        with: { campaignLotNumber: { columns: { lotNumber: true } } },
      },
    },
    orderBy: { givenAt: "asc", id: "asc" },
  });
  return doses.flatMap((one) =>
    one.givenAt
      ? [
          {
            id: one.id,
            tagNumber: one.animal.tagNumber,
            vaccine: one.product.nameBn,
            givenOn: farmDayOf(one.givenAt),
            lotNumber:
              one.lotNumber ??
              one.instance.campaignLotNumber?.lotNumber ??
              null,
            givenBy: one.giver?.name ?? null,
          },
        ]
      : []
  );
};

/**
 * R3, the vaccination register: every vaccine dose in a period — a year back from today unless asked — per
 * animal, with the vaccine, the date, the Lot Number and who gave it. What an inspector reads for FMD and
 * anthrax.
 */
export const VACCINATION_REGISTER: Register<VaccinationRow> = {
  name: "vaccination_register",
  looksBack: A_YEAR_BACK,
  read: vaccinationsBetween,
  paper: {
    title: { bn: "টিকার রেজিস্টার", en: "Vaccination register" },
    none: {
      bn: "এই সময়ে কোনো টিকা দেওয়া হয়নি",
      en: "No vaccinations in this period",
    },
    heading: (row) => row.tagNumber,
  },
  columns: [
    { csv: { header: "tag", value: (row) => row.tagNumber } },
    {
      paper: { bn: "টিকা", en: "Vaccine", said: (row) => row.vaccine },
      csv: { header: "vaccine", value: (row) => row.vaccine },
    },
    {
      paper: {
        bn: "তারিখ",
        en: "Date",
        said: (row, say) => say.day(row.givenOn),
      },
      csv: { header: "date", value: (row) => row.givenOn },
    },
    {
      paper: {
        bn: "লট নম্বর",
        en: "Lot number",
        said: (row) => row.lotNumber ?? NOTHING,
      },
      csv: { header: "lot_number", value: (row) => row.lotNumber },
    },
    {
      paper: {
        bn: "যিনি দিয়েছেন",
        en: "Given by",
        said: (row) => row.givenBy ?? NOTHING,
      },
      csv: { header: "given_by", value: (row) => row.givenBy },
    },
  ],
  kept: (rows) => ({
    doses: rows.length,
    withoutLot: rows.filter((row) => row.lotNumber === null).length,
  }),
};
