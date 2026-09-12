/** The clinical record's shared reads. */

import type { DoseRoute } from "@OpenFarm/domain";
import { z } from "zod";

import { dueAtFor } from "./instances-store";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 180;
/** One screenful of a fortnight's rounds. */
export const MAX_SEEN_ROWS = 200;

/**
 * How far back a health screen looks, and for which of the farm's own words. Shared, because
 * the Manager's sweep of what the rounds have seen and the Vet's queue of what nobody has
 * answered are the same question asked with a different default.
 */
export const seenLatelyInput = (defaultDays: number) =>
  z
    .object({
      /** One kind of thing seen, by the Version's own word for it. */
      saw: z.string().trim().max(60).optional(),
      days: z.number().int().min(1).max(MAX_DAYS).default(defaultDays),
    })
    .default(() => ({ days: defaultDays }));

/**
 * Everything one round saw in the window that still stands. A withdrawn Observation is kept —
 * somebody did say it — but it is not what the farm saw.
 */
export const seenLately = ({
  farmId,
  saw,
  days,
  now,
}: {
  farmId: string;
  saw?: string;
  days: number;
  now: Date;
}) => ({
  farmId,
  seenAt: { gte: new Date(now.getTime() - days * DAY_MS) },
  withdrawnAt: { isNull: true as const },
  ...(saw ? { saw } : {}),
});

/**
 * A Diagnosis as the farm reads it: the Vet's name beside their conclusion. The act is
 * theirs in law, so their name travels with it rather than being looked up by whoever
 * happens to be reading.
 */
export const diagnosisView = <T extends { vet: { name: string } }>(row: T) => {
  const { vet, ...rest } = row;
  return { ...rest, diagnosedByName: vet.name };
};

/**
 * When each dose of a Prescription falls due: as many occurrences of those times of day as
 * the course calls for, none of them in the past.
 *
 * Counting forward from now rather than from midnight is what makes a course prescribed at
 * noon start the same day — a twice-daily course of three days written at noon runs to its
 * sixth dose on the fourth morning, which is what the Vet standing in the shed means by it.
 *
 * And when every one of the day's times has already passed, the first dose is **now**: a Vet
 * who orders a once-daily antibiotic at ten in the morning means the cow gets one today, not
 * that she waits until tomorrow's eight o'clock.
 */
export const doseTimesFor = (
  now: Date,
  times: readonly string[],
  days: number
): Date[] => {
  const wanted = times.length * days;
  const stillToCome = (day: number) =>
    times
      .map((time) => dueAtFor(new Date(now.getTime() + day * DAY_MS), time))
      .filter((at) => at >= now)
      .toSorted((a, b) => a.getTime() - b.getTime());

  const doses: Date[] = stillToCome(0).length === 0 ? [now] : [];
  // One day past the course's length, because a course that starts mid-day finishes on the
  // morning after its last full day.
  for (let day = 0; day <= days && doses.length < wanted; day += 1) {
    for (const at of stillToCome(day)) {
      if (doses.length < wanted) {
        doses.push(at);
      }
    }
  }
  return doses;
};

/** One dose of a course as it is read back: what was owed, and what was given. */
interface DoseRow {
  id: string;
  number: number;
  dueAt: Date;
  givenAt: Date | null;
  giver: { name: string } | null;
  instance: { id: string; state: string };
}

/** A Prescription and its doses, as the database hands them over. */
interface PrescriptionRow {
  id: string;
  diagnosisId: string;
  dose: string;
  route: DoseRoute;
  times: string[];
  days: number;
  prescribedAt: Date;
  product: { nameBn: string; nameEn: string | null };
  vet: { name: string };
  treatments: DoseRow[];
}

/**
 * The course as the farm reads it: the order, the product, and every dose with the work
 * raised for it — which is what makes "dose four of six, and nobody gave the third" a thing
 * the Vet can see from their own phone.
 *
 * Written out rather than spread, because this is what the API answers with.
 */
export const prescriptionView = (row: PrescriptionRow) => ({
  id: row.id,
  diagnosisId: row.diagnosisId,
  dose: row.dose,
  route: row.route,
  times: row.times,
  days: row.days,
  prescribedAt: row.prescribedAt,
  productNameBn: row.product.nameBn,
  productNameEn: row.product.nameEn,
  prescribedByName: row.vet.name,
  doses: row.treatments
    .toSorted((a, b) => a.number - b.number)
    .map((dose) => ({
      id: dose.id,
      number: dose.number,
      dueAt: dose.dueAt,
      givenAt: dose.givenAt,
      instanceId: dose.instance.id,
      state: dose.instance.state,
      givenByName: dose.giver?.name ?? null,
    })),
});

export const thePrescription = {
  product: { columns: { nameBn: true, nameEn: true } },
  vet: { columns: { name: true } },
  treatments: {
    with: {
      instance: { columns: { id: true, state: true } },
      giver: { columns: { name: true } },
    },
  },
} as const;

/** Each Diagnosis with the courses ordered for it — the chain's next link, for a page that
 *  reads the whole of it at once. */
export const withPrescriptions = {
  prescriptions: {
    orderBy: { prescribedAt: "desc" },
    with: thePrescription,
  },
} as const;

/** The Vet's conclusion, and what was ordered because of it. */
export const theConclusionAndWhatFollowed = <
  T extends { vet: { name: string }; prescriptions: PrescriptionRow[] },
>(
  row: T
) => {
  const { prescriptions, ...rest } = row;
  return {
    ...diagnosisView(rest),
    prescriptions: prescriptions.map(prescriptionView),
  };
};
