import type { ExitState } from "@OpenFarm/domain";
import { farmDayOf, isExitState } from "@OpenFarm/domain";

import type { Db, Register, Saying } from "./register";

/** What became of an animal since she was diagnosed: still on the farm, or gone and when. */
export interface Outcome {
  kind: ExitState | "on_the_farm";
  on: string | null;
}

/** One diagnosis on the disease history, its day a farm day and its outcome still facts. */
export interface DiagnosisRow {
  id: string;
  diagnosedOn: string;
  tagNumber: string;
  disease: string;
  diagnosedBy: string;
  notifiable: boolean;
  reportReference: string | null;
  outcome: Outcome;
}

/**
 * Every diagnosis in a period, oldest first: the animal, the disease in the Vet's words, the Vet, whether the
 * farm's list made it notifiable and the reference its letter was delivered under, and what became of the
 * animal since. A report withdrawn because the disease came off the list is not notifiable.
 */
const diagnosesBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<DiagnosisRow[]> => {
  const rows = await db.query.diagnosis.findMany({
    where: { farmId, diagnosedAt: { gte: from, lt: until } },
    columns: { id: true, diagnosedAt: true, disease: true },
    with: {
      animal: {
        columns: { tagNumber: true, state: true, stateChangedAt: true },
      },
      vet: { columns: { name: true } },
      report: { columns: { reference: true, withdrawnAt: true } },
    },
    orderBy: { diagnosedAt: "asc", id: "asc" },
  });
  return rows.map((row) => {
    const { state } = row.animal;
    const kind: Outcome["kind"] = isExitState(state) ? state : "on_the_farm";
    const report = row.report?.withdrawnAt ? null : row.report;
    return {
      id: row.id,
      diagnosedOn: farmDayOf(row.diagnosedAt),
      tagNumber: row.animal.tagNumber,
      disease: row.disease,
      diagnosedBy: row.vet.name,
      notifiable: report !== null && report !== undefined,
      reportReference: report?.reference ?? null,
      outcome: {
        kind,
        on:
          kind === "on_the_farm" ? null : farmDayOf(row.animal.stateChangedAt),
      },
    };
  });
};

/** What became of an animal since her diagnosis, in both languages. */
const outcomeSaid = (row: DiagnosisRow, saying: Saying): string => {
  const { outcome } = row;
  if (outcome.kind === "on_the_farm") {
    return saying.both("inspector.onTheFarm");
  }
  const gone = saying.both(`state.${outcome.kind}`);
  return outcome.on ? `${gone} ${saying.day(outcome.on)}` : gone;
};

/** A diagnosis the farm reported and the office has yet to acknowledge. */
const NOT_YET_DELIVERED = "এখনো দেওয়া হয়নি / not yet delivered";

/** Six months of diagnoses, as a slaughter vet asks. */
const LOOK_BACK_MONTHS = 6;

/**
 * R5, the disease history: every diagnosis in a period — six months back from today unless asked — by date and
 * animal, the notifiable ones marked with the reference their letter to the office was delivered under, and
 * what became of the animal since. Printed, never given as a spreadsheet.
 */
export const DISEASE_HISTORY: Register<DiagnosisRow> = {
  name: "disease_history",
  looksBack: { months: -LOOK_BACK_MONTHS, days: 1 },
  read: diagnosesBetween,
  paper: {
    title: { bn: "রোগের ইতিহাস", en: "Disease history" },
    none: {
      bn: "এই সময়ে কোনো রোগ নির্ণয় হয়নি",
      en: "No diagnoses in this period",
    },
    heading: (row, say) =>
      `${say.day(row.diagnosedOn)} · ${row.tagNumber} · ${row.disease}${
        row.notifiable ? " · জ্ঞাপনযোগ্য / Notifiable" : ""
      }`,
  },
  columns: [
    { paper: { bn: "ভেট", en: "Vet", said: (row) => row.diagnosedBy } },
    {
      paper: {
        bn: "ডিএলএস রেফারেন্স",
        en: "DLS reference",
        // Only a notifiable diagnosis has an office to answer to; the others leave the line out.
        said: (row) =>
          row.notifiable ? (row.reportReference ?? NOT_YET_DELIVERED) : null,
      },
    },
    { paper: { bn: "পরিণতি", en: "Outcome", said: outcomeSaid } },
  ],
  said: (rows) => ({
    diagnoses: rows.length,
    notifiable: rows.filter((row) => row.notifiable).length,
  }),
};
