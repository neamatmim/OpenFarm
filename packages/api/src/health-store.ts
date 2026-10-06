/** The clinical record's shared reads. */

import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import {
  and,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "@OpenFarm/db/operators";
import { dlsReport, treatment } from "@OpenFarm/db/schema/health";
import { animal } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { DoseHold, DoseRoute, MilkHold } from "@OpenFarm/domain";
import {
  holdInForce,
  illAgainOf,
  namesTheDisease,
  withdrawalEndsAt,
} from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx, Trail } from "./audit";
import type { RaisedAlert } from "./instances-store";
import { dueAtFor, isOnTheFarm, raiseDueInstances } from "./instances-store";
import { rememberingPeople, tell } from "./notice";
import { contentOf, publishedContent } from "./sop-content";
import { callOffWork } from "./work-transitions";

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
  /** Always there for a course's dose: the work its Prescription raised. Only a dose not prescribed has none. */
  instance: {
    id: string;
    state: string;
    completions?: { skipReason: string | null }[];
  } | null;
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
  stoppedAt: Date | null;
  stoppedReason: string | null;
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
  /** When the Vet gave it up and why; nothing for a course running or run its length. */
  stopped: row.stoppedAt
    ? { at: row.stoppedAt, reason: row.stoppedReason }
    : null,
  doses: row.treatments
    .toSorted((a, b) => a.number - b.number)
    .flatMap(({ instance, ...dose }) =>
      instance
        ? [
            {
              id: dose.id,
              number: dose.number,
              dueAt: dose.dueAt,
              givenAt: dose.givenAt,
              instanceId: instance.id,
              state: instance.state,
              givenByName: dose.giver?.name ?? null,
              /** Why it was not given, for a dose skipped — "ওষুধ শেষ" — so the Vet can prescribe again. Never for
               *  a dose given. */
              skippedBecause: dose.givenAt
                ? null
                : (instance.completions?.[0]?.skipReason ?? null),
            },
          ]
        : []
    ),
});

export const thePrescription = {
  product: { columns: { nameBn: true, nameEn: true } },
  vet: { columns: { name: true } },
  treatments: {
    with: {
      instance: {
        columns: { id: true, state: true },
        // Why a dose was not given, where the Step was skipped: its work closes as done, and the dose is owed no more.
        with: {
          completions: {
            where: { skipReason: { isNotNull: true } },
            columns: { skipReason: true },
          },
        },
      },
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

/** The doses she has actually been given, each with the days it holds her milk and meat for. */
const herDoses = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animalId: string
) =>
  await tx.query.treatment.findMany({
    where: { farmId, animalId, givenAt: { isNotNull: true } },
    columns: {
      givenAt: true,
      learntAt: true,
      milkWithdrawalDays: true,
      meatWithdrawalDays: true,
    },
    // The product is the Treatment's own, so a campaign's dose is read the same way as a
    // course's — a Withdrawal does not care which put it there.
    with: {
      product: {
        columns: { milkWithdrawalDays: true, meatWithdrawalDays: true },
      },
    },
  });

type HerDose = Awaited<ReturnType<typeof herDoses>>[number];

/**
 * The days a dose holds her for: its own, kept when it was given — the product's then, or the Vet's Default
 * Withdrawal Days where the product had none — so days lowered on the Drug List afterwards free nobody, and days
 * raised there reach the dose by being written onto it (`reachBackWithdrawalDays`). The product's own are read only
 * for a dose that somehow kept none.
 */
export const milkDaysOf = (dose: {
  milkWithdrawalDays: number | null;
  product: { milkWithdrawalDays: number | null };
}) => dose.milkWithdrawalDays ?? dose.product.milkWithdrawalDays;
export const meatDaysOf = (dose: {
  meatWithdrawalDays: number | null;
  product: { meatWithdrawalDays: number | null };
}) => dose.meatWithdrawalDays ?? dose.product.meatWithdrawalDays;

/**
 * Each dose's hold on her milk, from when it was given to when its days run out: what tells the gate whether a
 * Withdrawal had begun by a milking already past (`milkHeldAt`).
 */
export const milkHoldsOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animalId: string
): Promise<MilkHold[]> => {
  const given = await herDoses(tx, farmId, animalId);
  return given.flatMap((dose) => {
    const days = milkDaysOf(dose);
    return dose.givenAt && days !== null
      ? [{ givenAt: dose.givenAt, until: withdrawalEndsAt(dose.givenAt, days) }]
      : [];
  });
};

/** Each dose's hold of one kind, with when the farm learnt of it. A product may not be prescribed without its days,
 *  so a dose given under one had them; days nobody wrote hold her for nothing. */
const holdsOf = (
  given: readonly HerDose[],
  daysOf: (dose: HerDose) => number | null
): DoseHold[] =>
  given.flatMap((dose) => {
    const days = daysOf(dose);
    return dose.givenAt && days !== null
      ? [
          {
            until: withdrawalEndsAt(dose.givenAt, days),
            learntAt: dose.learntAt,
          },
        ]
      : [];
  });

/** One cow's one Withdrawal, as the thing a notice is about. */
export const withdrawalNoticeId = (animalId: string, until: Date): string =>
  `${animalId}:${until.toISOString()}`;

/**
 * Tells the Manager that a cow's Withdrawal has changed: a dose has started one, or a Vet has
 * shortened one.
 *
 * The farm's notification table asks for this, and it is a different question from the one the
 * ending answers: a hold beginning takes her milk out of tomorrow's tank, and a hold shortened
 * puts it back. Told once per cow per hold, so a course of six doses is one piece of news rather
 * than six.
 */
export const raiseWithdrawalChanged = async (
  tx: Tx,
  farmId: string,
  told: { animalId: string; tagNumber: string; until: Date | null },
  now: Date
): Promise<RaisedAlert[]> =>
  await tell(
    tx,
    farmId,
    {
      kind: "withdrawal_changed",
      about: {
        id: withdrawalNoticeId(told.animalId, told.until ?? new Date(0)),
      },
      facts: {
        tag: told.tagNumber,
        until: told.until?.toISOString() ?? "",
      },
    },
    now
  );

/**
 * Works out both of a cow's Withdrawals from the Treatments she has actually been given, and
 * writes them where the gates read them.
 *
 * Worked out afresh every time rather than pushed forward dose by dose, because the answer has
 * to survive a Correction: a dose corrected back to a skip must shorten the hold again, and a
 * dose given late — or given days ago and only synced this morning — must lengthen it. The
 * latest end wins, whichever course or product it came from.
 *
 * A Vet's shortening holds the doses the farm knew of then to where the Vet said; a dose learnt of afterwards is new
 * knowledge, whenever it was given, and holds her on its own days beside it (`holdInForce`). Worked out the same way
 * every time, so a phone sending the same dose twice changes nothing. Once newer doses hold her longer than all the
 * shortening covered, it no longer says anything, and is put away.
 */
export const recomputeWithdrawal = async (
  tx: Tx,
  farmId: string,
  animalId: string,
  /** When a dose is being given now: a milk hold it starts is told to the Manager, once (`raiseWithdrawalChanged`). */
  givenNow?: Date
): Promise<{ milkUntil: Date | null; meatUntil: Date | null }> => {
  const given = await herDoses(tx, farmId, animalId);
  const her = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: {
      tagNumber: true,
      milkWithdrawalUntil: true,
      withdrawalShortenedAt: true,
      milkWithdrawalShortenedTo: true,
      meatWithdrawalShortenedTo: true,
    },
  });
  const at = her?.withdrawalShortenedAt ?? null;
  const shorteningOf = (to: Date | null | undefined) =>
    at && to ? { at, to } : null;
  const milkHolds = holdsOf(given, milkDaysOf);
  const meatHolds = holdsOf(given, meatDaysOf);
  const milk = holdInForce(
    milkHolds,
    shorteningOf(her?.milkWithdrawalShortenedTo)
  );
  const meat = holdInForce(
    meatHolds,
    shorteningOf(her?.meatWithdrawalShortenedTo)
  );
  const stillShortened = milk.shortened || meat.shortened;
  await tx
    .update(animal)
    .set({
      milkWithdrawalUntil: milk.until,
      meatWithdrawalUntil: meat.until,
      milkWithdrawalFromDoses: holdInForce(milkHolds, null).until,
      meatWithdrawalFromDoses: holdInForce(meatHolds, null).until,
      // Newer doses hold her longer than all the Vet's word covered, so it no longer describes anything the farm is
      // doing.
      ...(stillShortened
        ? {}
        : {
            withdrawalShortenedAt: null,
            withdrawalShortenedBy: null,
            withdrawalShortenedReason: null,
            milkWithdrawalShortenedTo: null,
            meatWithdrawalShortenedTo: null,
          }),
    })
    .where(eq(animal.id, animalId));
  // A dose that starts a milk hold — none in force before it, one now — takes her milk out of tomorrow's tank, which is
  // the Manager's to know (the notice table). A dose that only lengthens a hold already running tells nothing more.
  const heldBefore =
    her?.milkWithdrawalUntil !== null &&
    her?.milkWithdrawalUntil !== undefined &&
    givenNow !== undefined &&
    her.milkWithdrawalUntil > givenNow;
  if (givenNow && !heldBefore && milk.until && milk.until > givenNow) {
    await raiseWithdrawalChanged(
      tx,
      farmId,
      { animalId, tagNumber: her?.tagNumber ?? "", until: milk.until },
      givenNow
    );
  }
  return { milkUntil: milk.until, meatUntil: meat.until };
};

/**
 * Days raised for a product on the Drug List reach back to every dose of it already given, and every animal it was
 * given to is held afresh — the safe side: a label read wrong is put right on the cows already carrying it. Days
 * lowered reach nothing already given; the Vet frees an animal early by shortening her hold (the Owner, 2026-10-06).
 */
export const reachBackWithdrawalDays = async (
  tx: Tx,
  farmId: string,
  productId: string,
  days: { milkWithdrawalDays: number; meatWithdrawalDays: number }
): Promise<void> => {
  const raised = await tx
    .update(treatment)
    .set({
      milkWithdrawalDays: sql`greatest(coalesce(${treatment.milkWithdrawalDays}, 0), ${days.milkWithdrawalDays})`,
      meatWithdrawalDays: sql`greatest(coalesce(${treatment.meatWithdrawalDays}, 0), ${days.meatWithdrawalDays})`,
    })
    .where(
      and(
        eq(treatment.farmId, farmId),
        eq(treatment.productId, productId),
        isNotNull(treatment.givenAt),
        or(
          lt(treatment.milkWithdrawalDays, days.milkWithdrawalDays),
          lt(treatment.meatWithdrawalDays, days.meatWithdrawalDays),
          isNull(treatment.milkWithdrawalDays),
          isNull(treatment.meatWithdrawalDays)
        )
      )
    )
    .returning({ animalId: treatment.animalId });
  for (const animalId of new Set(raised.map((one) => one.animalId))) {
    // One at a time, inside the one transaction.
    // oxlint-disable-next-line no-await-in-loop
    await recomputeWithdrawal(tx, farmId, animalId);
  }
};

/**
 * Cows coming off a milk Withdrawal within the day, soonest first.
 *
 * The Manager plans the tank around this: milk that could have been sold and was poured away
 * is money, and so is milk that went to the tank a day early. One of the two notices the farm
 * sends immediately rather than in the digest.
 */
export interface EndingSoon {
  id: string;
  tagNumber: string;
  penId: string;
  milkWithdrawalUntil: Date | null;
}

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
    columns: {
      id: true,
      tagNumber: true,
      penId: true,
      milkWithdrawalUntil: true,
    },
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
 * Tells the Manager, and the milkers of her Pen, that a milk Withdrawal is nearly over — the
 * two the farm's notification table names for this, because they are the people who decide
 * where tomorrow morning's litres go.
 *
 * Once per cow per Withdrawal: the end instant is part of what the notice is about, so a second
 * course months later is a new thing to be told rather than one already dismissed.
 */
export const raiseWithdrawalAlerts = async (
  tx: Tx,
  farmId: string,
  ending: EndingSoon[],
  now: Date
): Promise<RaisedAlert[]> => {
  if (ending.length === 0) {
    return [];
  }
  const raised: RaisedAlert[] = [];
  // One sweep, one question: who the Managers are does not change between two cows, and the milkers of a Pen are the
  // same for every cow standing in it.
  const remembering = rememberingPeople();
  for (const beast of ending) {
    const until = beast.milkWithdrawalUntil;
    if (!until) {
      continue;
    }
    // Deliberately sequential: a herd of concurrent upserts against one unique index buys
    // nothing but lock contention.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "withdrawal_ending",
        // The Withdrawal, not the cow: one cow has many over her life, and this notice is about one of them. Her id
        // and tag travel in its facts, so anything reading the notice can still find her.
        about: {
          id: withdrawalNoticeId(beast.id, until),
          penId: beast.penId,
        },
        facts: {
          tag: beast.tagNumber,
          animalId: beast.id,
          until: until.toISOString(),
        },
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};

/** Whether any of these Withdrawals is still worth telling anybody about. Asked before a
 *  transaction is opened, because a sweep with nothing to say is not an event — everyone calls
 *  it on opening the app, and in steady state there is nothing new. */
export const anyUntold = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  ending: EndingSoon[]
): Promise<boolean> => {
  const ids = ending.flatMap((beast) =>
    beast.milkWithdrawalUntil
      ? [withdrawalNoticeId(beast.id, beast.milkWithdrawalUntil)]
      : []
  );
  if (ids.length === 0) {
    return false;
  }
  const told = await db.query.alert.findMany({
    where: { farmId, kind: "withdrawal_ending", entityId: { in: ids } },
    columns: { entityId: true },
  });
  const said = new Set(told.map((row) => row.entityId));
  return ids.some((id) => !said.has(id));
};

/**
 * The procedure the farm reports with: the one whose Version says a notifiable Diagnosis raises
 * it. An SOP declares what raises it, so there is no second place recording which procedure this
 * is — and the Owner can reword the letter's Step without it becoming a different procedure.
 */
export const theReportSop = async (tx: Tx, farmId: string) => {
  const definitions = await tx.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    orderBy: { createdAt: "asc" },
    with: { currentVersion: true },
  });
  const reporting = definitions.find((definition) =>
    publishedContent(definition)?.triggers.some(
      (trigger) => trigger.kind === "notifiable_disease"
    )
  );
  if (!reporting?.currentVersion) {
    return null;
  }
  return {
    definitionId: reporting.id,
    versionId: reporting.currentVersion.id,
    content: contentOf(reporting.currentVersion),
  };
};

/**
 * Is this what the Vet called it one of the diseases the farm must report?
 *
 * Matched on the Vet's own words, because that is what both the list and the Diagnosis are
 * written in — against each disease's name, its English and the other names it goes by
 * ("FMD", "খুরা রোগ"), spelt either Unicode way, whatever the capitals, spaces or dashes. A
 * name the list does not know yet is the Owner's, the Manager's or the Vet's to add to it.
 */
export const isNotifiable = async (
  tx: Tx,
  farmId: string,
  disease: { bn: string; en?: string }
): Promise<{ id: string; nameBn: string } | null> => {
  const list = await tx.query.notifiableDisease.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    columns: { id: true, nameBn: true, nameEn: true, otherNames: true },
  });
  const found = list.find((one) => namesTheDisease(one, disease));
  return found ? { id: found.id, nameBn: found.nameBn } : null;
};

/**
 * Raises the report of one notifiable Diagnosis — now, due now, because the Act says the report
 * goes without delay and a farm that waits for somebody to open an app has waited.
 *
 * Once per Diagnosis: the cause names it, so nothing can raise a second report for the same
 * conclusion however often anything runs. Returns nothing when the farm has published no report
 * procedure — the Diagnosis still stands, and the farm is told what it is missing elsewhere.
 */
export const raiseTheReport = async (
  tx: Tx,
  {
    farmId,
    diagnosisId,
    diseaseId,
    animalId,
    penId,
    now,
  }: {
    farmId: string;
    diagnosisId: string;
    /** Which of the farm's listed diseases matched, so the report can say what it was made as. */
    diseaseId: string;
    animalId: string;
    penId: string;
    now: Date;
  }
): Promise<{ reportId: string; instanceId: string | null }> => {
  const sop = await theReportSop(tx, farmId);
  const [raised] = sop
    ? await raiseDueInstances(
        tx,
        farmId,
        [
          {
            definitionId: sop.definitionId,
            versionId: sop.versionId,
            penId,
            animalId,
            dueAt: now,
            cause: `notifiable:${diagnosisId}`,
            graceMinutes: sop.content.graceMinutes,
            assignedRole: sop.content.assignedRole,
            checkerRole: sop.content.checkerRole,
          },
        ],
        now
      )
    : [];
  const id = uuidv7(now);
  // The report exists whether or not the Playbook has work for it: the duty is the Act's, not
  // the Playbook's, and a farm with no procedure published still has a letter to write and take.
  // Its Instance is only how the farm remembers to do it.
  const [row] = await tx
    .insert(dlsReport)
    .values({
      id,
      farmId,
      diagnosisId,
      diseaseId,
      instanceId: raised?.id ?? null,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: dlsReport.id });
  return { reportId: row?.id ?? id, instanceId: raised?.id ?? null };
};

/**
 * A Correction to a Diagnosis can change whether the farm owes the office a letter at all.
 *
 * Newly notifiable: the duty starts now, so the report and the work are raised now. No longer
 * notifiable: the letter is not owed, so a report nobody has delivered is withdrawn and the work
 * to deliver it is closed — leaving the Manager under orders to write a letter about a disease
 * the Vet has taken back would be worse than not raising one.
 *
 * A report already delivered is left exactly where it is. That letter went.
 */
export const reconsiderTheReport = async (
  tx: Tx,
  {
    farmId,
    diagnosisId,
    disease,
    animalId,
    penId,
    now,
    trail,
  }: {
    farmId: string;
    diagnosisId: string;
    disease: { bn: string; en?: string };
    animalId: string;
    penId: string;
    now: Date;
    /** The trail of the Vet's Correction: the delivery work a withdrawn report calls off is written there. */
    trail: Trail;
  }
): Promise<{ notifiable: boolean; instanceId: string | null }> => {
  const listed = await isNotifiable(tx, farmId, disease);
  const standing = await tx.query.dlsReport.findFirst({
    where: { diagnosisId, withdrawnAt: { isNull: true } },
    columns: { id: true, instanceId: true, deliveredAt: true },
  });
  if (listed) {
    if (standing) {
      return { notifiable: true, instanceId: standing.instanceId };
    }
    const raised = await raiseTheReport(tx, {
      farmId,
      diagnosisId,
      diseaseId: listed.id,
      animalId,
      penId,
      now,
    });
    return { notifiable: true, instanceId: raised.instanceId };
  }
  if (standing && !standing.deliveredAt) {
    await tx
      .update(dlsReport)
      .set({ withdrawnAt: now })
      .where(eq(dlsReport.id, standing.id));
    if (standing.instanceId) {
      await callOffWork(tx, farmId, eq(sopInstance.id, standing.instanceId), {
        trail,
        by: "report_withdrawn",
      });
    }
  }
  return { notifiable: false, instanceId: null };
};

/**
 * Tells the Owner and the Manager that a disease the farm must report has been found.
 *
 * Immediately, and to both: the Manager takes the letter to the office and the Owner answers
 * for the farm if it does not go. One notice per Diagnosis, so the same conclusion cannot be
 * announced twice.
 */
export const raiseNotifiableAlerts = async (
  tx: Tx,
  farmId: string,
  told: { diagnosisId: string; tagNumber: string; disease: string },
  now: Date
): Promise<RaisedAlert[]> =>
  await tell(
    tx,
    farmId,
    {
      kind: "notifiable_diagnosis",
      about: { id: told.diagnosisId },
      facts: { tag: told.tagNumber, disease: told.disease },
    },
    now
  );

/** What the Vet concluded she has. The glossary's word for the thing itself is Disease; the
 *  record of concluding it is the Diagnosis. */
export const diseaseInput = z.object({
  bn: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).optional(),
});

/** What the Vet adds to a Diagnosis in their own words. */
export const diagnosisNoteInput = z.string().trim().max(2000);

/** The Diagnosis as it stands, for the trail to record either side of a change. One reader
 *  for both the recording and the Correction, so the trail holds one shape throughout. */
export const readDiagnosis = async (tx: Tx, id: string) => {
  const row = await tx.query.diagnosis.findFirst({
    where: { id },
    columns: {
      animalId: true,
      observationId: true,
      disease: true,
      diseaseEn: true,
      note: true,
      outcome: true,
    },
  });
  return row ?? null;
};

/**
 * The animals still on the farm the Vet has diagnosed at least the farm's number of times within its days, for the
 * Manager's list: her tag, how many, and the latest.
 */
export const illAgainOn = async (
  db: Pick<Database, "query">,
  farm: { id: string; illAgainDiagnoses: number; illAgainDays: number },
  now: Date
) => {
  const since = new Date(
    now.getTime() - farm.illAgainDays * 24 * 60 * 60 * 1000
  );
  const rows = await db.query.diagnosis.findMany({
    where: { farmId: farm.id, diagnosedAt: { gte: since } },
    columns: { animalId: true, disease: true, diagnosedAt: true },
    with: { animal: { columns: { tagNumber: true, state: true } } },
  });
  const tags = new Map(
    rows
      .filter((row) => isOnTheFarm(row.animal))
      .map((row) => [row.animalId, row.animal.tagNumber])
  );
  return illAgainOf(
    rows.filter((row) => tags.has(row.animalId)),
    now,
    farm
  ).map((one) => ({ ...one, tag: tags.get(one.animalId) ?? "" }));
};
