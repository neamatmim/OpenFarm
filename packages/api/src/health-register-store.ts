import type { Database } from "@OpenFarm/db";
import type {
  DiseaseHistoryLine,
  DoseRoute,
  ExitState,
  HealthRegister,
  TreatmentRegisterLine,
} from "@OpenFarm/domain";
import { farmDayOf, isExitState, withdrawalEndsAt } from "@OpenFarm/domain";

type Db = Pick<Database, "query">;

/** How far back the treatment register looks unless asked: thirty days, the last one included, as an inspector
 *  asks. */
const TREATMENT_LOOK_BACK_DAYS = 30;

/** How far back the disease history looks unless asked: six months, as a slaughter vet asks. */
const DISEASE_LOOK_BACK_MONTHS = 6;

/** A farm day moved by calendar months, then days — the 10th of April six months back and a day on is the 11th
 *  of October. A month too short for the day ends it: the 31st of August six months back is the 29th of
 *  February, never March. */
const dayMoved = (day: string, { months = 0, days = 0 }) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const monthIndex = month - 1 + months;
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const moved = new Date(
    Date.UTC(year, monthIndex, Math.min(date, lastOfMonth) + days)
  );
  return moved.toISOString().slice(0, "YYYY-MM-DD".length);
};

/** The first day a register covers when nobody names one, for a period ending on a given farm day: thirty days
 *  of treatments, six months of diagnoses, the last day counted in both. */
export const lookBackFrom = (register: HealthRegister, to: string): string =>
  register === "treatment_register"
    ? dayMoved(to, { days: 1 - TREATMENT_LOOK_BACK_DAYS })
    : dayMoved(to, { months: -DISEASE_LOOK_BACK_MONTHS, days: 1 });

/** One dose on the treatment register, in the DLS template's order: the printed line before it is written out,
 *  its days as farm days and its route the word the Vet chose. */
export type TreatmentLine = Omit<TreatmentRegisterLine, "route"> & {
  id: string;
  route: DoseRoute | null;
};

/**
 * Every dose given in a period, oldest first: the animal, what was wrong with her, the drug, dose and route,
 * which dose of the course it was, who gave it, the Vet who prescribed it, and when her milk and meat were
 * clear of it. A campaign's dose, which nobody prescribed, carries no diagnosis, dose, route or prescriber.
 */
export const treatmentsBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<TreatmentLine[]> => {
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

/** What became of an animal since she was diagnosed: still on the farm, or gone and when. */
export interface Outcome {
  kind: ExitState | "on_the_farm";
  on: string | null;
}

/** One diagnosis on the disease history: the printed line before it is written out, its outcome still facts. */
export type DiagnosisLine = Omit<DiseaseHistoryLine, "outcome"> & {
  id: string;
  outcome: Outcome;
};

/**
 * Every diagnosis in a period, oldest first: the animal, the disease in the Vet's words, the Vet, whether the
 * farm's list made it notifiable and the reference its letter was delivered under, and what became of the
 * animal since. A report withdrawn because the disease came off the list is not notifiable.
 */
export const diagnosesBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<DiagnosisLine[]> => {
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
