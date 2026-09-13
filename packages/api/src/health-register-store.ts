import type { Database } from "@OpenFarm/db";
import type { DoseRoute, TreatmentRegisterLine } from "@OpenFarm/domain";
import { farmDayOf, isExitState, withdrawalEndsAt } from "@OpenFarm/domain";

type Db = Pick<Database, "query">;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back the treatment register looks unless asked: thirty days, as an inspector asks. */
const TREATMENT_LOOK_BACK_DAYS = 30;

/** How far back the disease history looks unless asked: six months, as a slaughter vet asks. */
const DISEASE_LOOK_BACK_MONTHS = 6;

/** The farm day this many calendar months before another — the 10th of April back to the 10th of October. */
const monthsBefore = (day: string, months: number): string => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const back = new Date(Date.UTC(year, month - 1 - months, date));
  return back.toISOString().slice(0, "YYYY-MM-DD".length);
};

/** The window a register covers when nobody names one, ending today: thirty days for treatments, six months
 *  for diseases. */
export const defaultWindow = (
  register: "treatment_register" | "disease_history",
  now: Date
): { from: string; to: string } => {
  const today = farmDayOf(now);
  return register === "treatment_register"
    ? {
        from: farmDayOf(
          new Date(now.getTime() - TREATMENT_LOOK_BACK_DAYS * DAY_MS)
        ),
        to: today,
      }
    : { from: monthsBefore(today, DISEASE_LOOK_BACK_MONTHS), to: today };
};

/** One dose on the treatment register, in the DLS template's order: the printed line before it is written out,
 *  its days as farm days and its route the word the Vet chose. */
export type TreatmentLine = Omit<TreatmentRegisterLine, "route"> & {
  route: DoseRoute | null;
};

/**
 * Every dose given in a window, oldest first: the animal, what was wrong with her, the drug, dose and route,
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
    columns: { givenAt: true, number: true },
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

/** What became of an animal since she was diagnosed: still on the farm in a State, or gone and when. */
export interface Outcome {
  kind: "on_the_farm" | "sold" | "died" | "culled";
  state: string;
  on: string | null;
}

/** One diagnosis on the disease history. */
export interface DiagnosisLine {
  diagnosedOn: string;
  tagNumber: string;
  disease: string;
  diagnosedBy: string;
  notifiable: boolean;
  /** The office's reference the letter was delivered under; null until it was. */
  reportReference: string | null;
  outcome: Outcome;
}

/**
 * Every diagnosis in a window, oldest first: the animal, the disease in the Vet's words, the Vet, whether the
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
    columns: { diagnosedAt: true, disease: true },
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
      diagnosedOn: farmDayOf(row.diagnosedAt),
      tagNumber: row.animal.tagNumber,
      disease: row.disease,
      diagnosedBy: row.vet.name,
      notifiable: report !== null && report !== undefined,
      reportReference: report?.reference ?? null,
      outcome: {
        kind,
        state,
        on:
          kind === "on_the_farm" ? null : farmDayOf(row.animal.stateChangedAt),
      },
    };
  });
};
