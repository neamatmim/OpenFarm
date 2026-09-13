import type { Database } from "@OpenFarm/db";
import type {
  DiseaseHistoryLine,
  DoseRoute,
  ExitState,
  HealthRegister,
  TreatmentRegisterLine,
  VaccinationRegisterLine,
} from "@OpenFarm/domain";
import { farmDayOf, isExitState, withdrawalEndsAt } from "@OpenFarm/domain";

type Db = Pick<Database, "query">;

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

/** How far back each register looks unless asked, the last day counted: a year of vaccinations, since FMD and
 *  anthrax come round yearly; thirty days of treatments, as an inspector asks; six months of diagnoses, as a
 *  slaughter vet asks. */
const LOOK_BACK: Record<HealthRegister, { months: number; days: number }> = {
  vaccination_register: { months: -12, days: 1 },
  treatment_register: { months: 0, days: -29 },
  disease_history: { months: -6, days: 1 },
};

/** The first day a register covers when nobody names one, for a period ending on a given farm day. */
export const lookBackFrom = (register: HealthRegister, to: string): string =>
  dayMoved(to, LOOK_BACK[register]);

/** One vaccine dose on the vaccination register, its day a farm day. */
export type VaccinationLine = VaccinationRegisterLine & { id: string };

/**
 * Every dose of a product the Vet has marked a vaccine, given in a period, oldest first: the animal, the vaccine,
 * the day, the Lot Number — the dose's own, or else its campaign run's — and who gave it. A product marked a
 * vaccine after it was given still puts its doses here, with no lot if nobody wrote one.
 */
export const vaccinationsBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<VaccinationLine[]> => {
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
        with: { lot: { columns: { lotNumber: true } } },
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
            lotNumber: one.lotNumber ?? one.instance.lot?.lotNumber ?? null,
            givenBy: one.giver?.name ?? null,
          },
        ]
      : []
  );
};

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
