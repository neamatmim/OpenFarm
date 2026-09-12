/** The clinical record's shared reads. */

import type { Database } from "@OpenFarm/db";
import { eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import type { DoseRoute } from "@OpenFarm/domain";
import { withdrawalEndsAt } from "@OpenFarm/domain";
import { z } from "zod";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";
import type { RaisedAlert } from "./instances-store";
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

/** The later of two ends, either of which may be nothing. */
const later = (a: Date | null, b: Date | null): Date | null => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return a > b ? a : b;
};

/**
 * Cows coming off a milk Withdrawal within the day, soonest first.
 *
 * The Manager plans the tank around this: milk that could have been sold and was poured away
 * is money, and so is milk that went to the tank a day early. One of the two notices the farm
 * sends immediately rather than in the digest.
 */
export const withdrawalsEndingSoon = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  now: Date
) => {
  const rows = await db.query.animal.findMany({
    where: {
      farmId,
      milkWithdrawalUntil: {
        gt: now,
        lte: new Date(now.getTime() + DAY_MS),
      },
    },
    columns: { id: true, tagNumber: true, milkWithdrawalUntil: true },
  });
  if (rows.length === 0) {
    return rows;
  }
  // Only a hold the farm can account for. A Withdrawal always comes from a Treatment — that
  // is the only thing that writes one — so a date with no dose behind it is a date nobody can
  // explain, and telling somebody their cow is coming off a hold nobody can name is how a
  // farm learns to ignore its Alerts.
  const doses = await db.query.treatment.findMany({
    where: {
      farmId,
      animalId: { in: rows.map((beast) => beast.id) },
      givenAt: { isNotNull: true },
    },
    columns: { animalId: true },
  });
  const treated = new Set(doses.map((dose) => dose.animalId));
  return rows
    .filter((beast) => treated.has(beast.id))
    .toSorted(
      (a, b) =>
        (a.milkWithdrawalUntil?.getTime() ?? 0) -
        (b.milkWithdrawalUntil?.getTime() ?? 0)
    );
};

/**
 * Tells the Owner and the Manager that a Withdrawal is nearly over — once per cow per
 * Withdrawal, because the end instant is part of what the Alert is about. A second course
 * months later is a different thing to be told.
 */
export const raiseWithdrawalAlerts = async (
  tx: Tx,
  farmId: string,
  ending: { id: string; tagNumber: string; milkWithdrawalUntil: Date | null }[],
  now: Date
): Promise<RaisedAlert[]> => {
  if (ending.length === 0) {
    return [];
  }
  const told = await holdersOf(tx, farmId, ["owner", "manager"]);
  const raised: RaisedAlert[] = [];
  for (const beast of ending) {
    const until = beast.milkWithdrawalUntil;
    if (!until) {
      continue;
    }
    // Deliberately sequential: a herd of concurrent upserts against one unique index buys
    // nothing but lock contention.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await raiseAlerts(
      tx,
      farmId,
      told,
      {
        kind: "withdrawal_ending",
        entity: "animal",
        /** The cow and the Withdrawal: told again for the next course, not for this one. */
        entityId: `${beast.id}:${until.toISOString()}`,
        params: { tag: beast.tagNumber, until: until.toISOString() },
      },
      now
    );
    raised.push(
      ...rows.map((row) => ({
        ...row,
        kind: "withdrawal_ending" as const,
        entity: "animal",
        entityId: `${beast.id}:${until.toISOString()}`,
        params: { tag: beast.tagNumber, until: until.toISOString() },
      }))
    );
  }
  return raised;
};

/**
 * Works out both of a cow's Withdrawals from the Treatments she has actually been given, and
 * writes them where the gates read them.
 *
 * Worked out afresh every time rather than pushed forward dose by dose, because the answer
 * has to survive a Correction: a dose corrected back to a skip must shorten the hold again,
 * and a dose given late must lengthen it. The latest end wins, whichever course or product it
 * came from — two overlapping courses hold her until the last of them lets go.
 *
 * A Vet's shortening stands until she is given another dose. After that the new dose sets the
 * dates afresh: the exception was about the course that had finished, not a promise about
 * everything to come.
 */
export const recomputeWithdrawal = async (
  tx: Tx,
  farmId: string,
  animalId: string
): Promise<{ milkUntil: Date | null; meatUntil: Date | null }> => {
  const given = await tx.query.treatment.findMany({
    where: { farmId, animalId, givenAt: { isNotNull: true } },
    columns: { givenAt: true },
    with: {
      prescription: {
        columns: {},
        with: {
          product: {
            columns: { milkWithdrawalDays: true, meatWithdrawalDays: true },
          },
        },
      },
    },
  });
  let milkUntil: Date | null = null;
  let meatUntil: Date | null = null;
  let lastGiven: Date | null = null;
  for (const dose of given) {
    const { givenAt } = dose;
    const { milkWithdrawalDays, meatWithdrawalDays } =
      dose.prescription.product;
    if (!givenAt) {
      continue;
    }
    if (!lastGiven || givenAt > lastGiven) {
      lastGiven = givenAt;
    }
    // A product may not be prescribed without its days, so a dose given under one always has
    // them; a product whose days were cleared afterwards holds her for as long as the rest.
    const milkEnd =
      milkWithdrawalDays === null
        ? null
        : withdrawalEndsAt(givenAt, milkWithdrawalDays);
    const meatEnd =
      meatWithdrawalDays === null
        ? null
        : withdrawalEndsAt(givenAt, meatWithdrawalDays);
    milkUntil = later(milkUntil, milkEnd);
    meatUntil = later(meatUntil, meatEnd);
  }

  const her = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: {
      milkWithdrawalUntil: true,
      meatWithdrawalUntil: true,
      withdrawalShortenedAt: true,
    },
  });
  // The Vet shortened it and nothing has been given since: their word stands.
  if (
    her?.withdrawalShortenedAt &&
    (!lastGiven || lastGiven <= her.withdrawalShortenedAt)
  ) {
    return {
      milkUntil: her.milkWithdrawalUntil,
      meatUntil: her.meatWithdrawalUntil,
    };
  }
  await tx
    .update(animal)
    .set({
      milkWithdrawalUntil: milkUntil,
      meatWithdrawalUntil: meatUntil,
      // A dose given after a shortening puts the farm back on the product's own days, so the
      // old exception no longer describes anything.
      ...(her?.withdrawalShortenedAt && lastGiven
        ? {
            withdrawalShortenedAt: null,
            withdrawalShortenedBy: null,
            withdrawalShortenedReason: null,
          }
        : {}),
    })
    .where(eq(animal.id, animalId));
  return { milkUntil, meatUntil };
};
