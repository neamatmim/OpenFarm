import type { Disposal, MortalityKind } from "@OpenFarm/domain";
import { STILLBIRTH, farmDayOf } from "@OpenFarm/domain";

import type { Db, Register, Saying } from "./register";
import { A_YEAR_BACK } from "./register";

/** One death on the mortality register, its day a farm day and its disposal null while it is awaited. */
export interface DeathRow {
  id: string;
  tagNumber: string;
  diedOn: string;
  kind: MortalityKind;
  cause: string;
  disposal: Disposal | null;
  disposalNote: string | null;
  reportReference: string | null;
}

/**
 * Every death and cull in a period, oldest first: the animal, the day, the cause, how the carcass went — nothing
 * yet for a stillborn calf the Manager has still to say of — and the reference the office filed the report
 * under, for a death attributed to a notifiable Diagnosis whose report was delivered and still stands.
 */
const deathsBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<DeathRow[]> => {
  const rows = await db.query.mortality.findMany({
    where: { farmId, happenedAt: { gte: from, lt: until } },
    with: {
      animal: { columns: { tagNumber: true } },
      diagnosis: {
        columns: {},
        with: { report: { columns: { reference: true, withdrawnAt: true } } },
      },
    },
    orderBy: { happenedAt: "asc", id: "asc" },
  });
  return rows.map((row) => {
    const report = row.diagnosis?.report;
    return {
      id: row.id,
      tagNumber: row.animal.tagNumber,
      diedOn: farmDayOf(row.happenedAt),
      kind: row.kind,
      cause: row.cause,
      disposal: row.disposal,
      disposalNote: row.disposalNote,
      reportReference: report?.withdrawnAt ? null : (report?.reference ?? null),
    };
  });
};

/** How the carcass went, with where and how beside it — or that the farm is still to say. */
const disposalSaid = (death: DeathRow, saying: Saying) => {
  if (!death.disposal) {
    return saying.both("mortality.awaitingDisposal");
  }
  const said = saying.both(`mortality.${death.disposal}`);
  return death.disposalNote ? `${said} — ${death.disposalNote}` : said;
};

/**
 * R6, the mortality register: every death and cull in a period — a year back from today unless asked — with
 * the cause, how the carcass was disposed of or that it is awaited, and the DLS reference when it was
 * notifiable.
 */
export const MORTALITY_REGISTER: Register<DeathRow> = {
  name: "mortality_register",
  looksBack: A_YEAR_BACK,
  read: deathsBetween,
  paper: {
    title: { bn: "মৃত্যুর রেজিস্টার", en: "Mortality register" },
    none: {
      bn: "এই সময়ে কোনো মৃত্যু হয়নি",
      en: "No deaths in this period",
    },
    heading: (row) => row.tagNumber,
  },
  columns: [
    { csv: { header: "tag", value: (row) => row.tagNumber } },
    {
      paper: {
        bn: "তারিখ",
        en: "Date",
        said: (row, say) => say.day(row.diedOn),
      },
      csv: { header: "date", value: (row) => row.diedOn },
    },
    // Whether she died or was culled: the paper says it in the cause, the spreadsheet counts it.
    { csv: { header: "kind", value: (row) => row.kind } },
    {
      paper: {
        bn: "কারণ",
        en: "Cause",
        // A stillbirth in the reader's words; any other cause as whoever recorded it wrote it.
        said: (row, say) =>
          row.cause === STILLBIRTH
            ? say.both("mortality.stillbirth")
            : row.cause,
      },
      csv: { header: "cause", value: (row) => row.cause },
    },
    {
      paper: { bn: "নিষ্পত্তি", en: "Disposal", said: disposalSaid },
      csv: { header: "disposal", value: (row) => row.disposal ?? "awaiting" },
    },
    { csv: { header: "disposal_note", value: (row) => row.disposalNote } },
    {
      paper: {
        bn: "ডিএলএস রেফারেন্স",
        en: "DLS reference",
        // A death with nothing filed against it leaves the line out — as does one whose reference is blank,
        // which is a reference nobody wrote.
        said: (row) => row.reportReference || null,
      },
      csv: { header: "dls_reference", value: (row) => row.reportReference },
    },
  ],
  kept: (rows) => ({
    deaths: rows.length,
    awaitingDisposal: rows.filter((row) => row.disposal === null).length,
  }),
};
