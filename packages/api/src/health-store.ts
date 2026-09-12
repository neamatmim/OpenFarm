/** The clinical record's shared reads. */

import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { dlsReport } from "@OpenFarm/db/schema/health";
import { animal } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { DoseRoute } from "@OpenFarm/domain";
import { withdrawalEndsAt } from "@OpenFarm/domain";
import { z } from "zod";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";
import type { RaisedAlert } from "./instances-store";
import { dueAtFor, raiseDueInstances } from "./instances-store";
import { contentOf, publishedContent } from "./sop-content";

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

const sameInstant = (a: Date | null, b: Date | null): boolean =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** What her Treatments alone say her two Withdrawals are: the last dose of each product plus
 *  that product's own days, whichever course it came from. */
const fromHerDoses = async (tx: Tx, farmId: string, animalId: string) => {
  const given = await tx.query.treatment.findMany({
    where: { farmId, animalId, givenAt: { isNotNull: true } },
    columns: { givenAt: true },
    // The product is the Treatment's own, so a campaign's dose is read the same way as a
    // course's — a Withdrawal does not care which put it there.
    with: {
      product: {
        columns: { milkWithdrawalDays: true, meatWithdrawalDays: true },
      },
    },
  });
  let milk: Date | null = null;
  let meat: Date | null = null;
  for (const dose of given) {
    const { givenAt } = dose;
    if (!givenAt) {
      continue;
    }
    // A product may not be prescribed without its days, so a dose given under one had them.
    // Days cleared from the Drug List afterwards therefore cannot free a cow retrospectively
    // — but they also cannot hold her, and nothing on the farm clears them.
    const { milkWithdrawalDays, meatWithdrawalDays } = dose.product;
    milk = later(
      milk,
      milkWithdrawalDays === null
        ? null
        : withdrawalEndsAt(givenAt, milkWithdrawalDays)
    );
    meat = later(
      meat,
      meatWithdrawalDays === null
        ? null
        : withdrawalEndsAt(givenAt, meatWithdrawalDays)
    );
  }
  return { milk, meat };
};

/**
 * Works out both of a cow's Withdrawals from the Treatments she has actually been given, and
 * writes them where the gates read them.
 *
 * Worked out afresh every time rather than pushed forward dose by dose, because the answer has
 * to survive a Correction: a dose corrected back to a skip must shorten the hold again, and a
 * dose given late — or given days ago and only synced this morning — must lengthen it. The
 * latest end wins, whichever course or product it came from.
 *
 * A Vet's shortening stands only while the doses say what they said when the Vet wrote it.
 * That is why what the doses alone say is kept beside the dates in force: a phone sending the
 * same dose twice finds nothing changed and leaves the Vet's word alone, while a dose the farm
 * had not seen before supersedes it — the Vet shortened a hold on what was known then, and a
 * dose is new knowledge, whenever it happened to be given.
 */
export const recomputeWithdrawal = async (
  tx: Tx,
  farmId: string,
  animalId: string
): Promise<{ milkUntil: Date | null; meatUntil: Date | null }> => {
  const doses = await fromHerDoses(tx, farmId, animalId);
  const her = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: {
      milkWithdrawalUntil: true,
      meatWithdrawalUntil: true,
      milkWithdrawalFromDoses: true,
      meatWithdrawalFromDoses: true,
    },
  });
  const unchanged =
    sameInstant(doses.milk, her?.milkWithdrawalFromDoses ?? null) &&
    sameInstant(doses.meat, her?.meatWithdrawalFromDoses ?? null);
  if (her && unchanged) {
    // Nothing the farm did not already know. Whatever is in force — the product's days, or a
    // shorter end a Vet has since written — stays in force.
    return {
      milkUntil: her.milkWithdrawalUntil,
      meatUntil: her.meatWithdrawalUntil,
    };
  }
  await tx
    .update(animal)
    .set({
      milkWithdrawalUntil: doses.milk,
      meatWithdrawalUntil: doses.meat,
      milkWithdrawalFromDoses: doses.milk,
      meatWithdrawalFromDoses: doses.meat,
      // Her doses have changed, so a shortening written against the old ones no longer
      // describes anything the farm is doing.
      withdrawalShortenedAt: null,
      withdrawalShortenedBy: null,
      withdrawalShortenedReason: null,
    })
    .where(eq(animal.id, animalId));
  return { milkUntil: doses.milk, meatUntil: doses.meat };
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

/** One cow's one Withdrawal, as the thing a notice is about. */
export const withdrawalNoticeId = (animalId: string, until: Date): string =>
  `${animalId}:${until.toISOString()}`;

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
  const managers = await holdersOf(tx, farmId, ["manager"]);
  const milkers = await tx.query.penAssignment.findMany({
    where: { farmId, penId: { in: ending.map((beast) => beast.penId) } },
    columns: { penId: true, userId: true },
  });
  const raised: RaisedAlert[] = [];
  for (const beast of ending) {
    const until = beast.milkWithdrawalUntil;
    if (!until) {
      continue;
    }
    const told = [
      ...managers,
      ...milkers
        .filter((row) => row.penId === beast.penId)
        .map((row) => row.userId),
    ];
    const notice = {
      kind: "withdrawal_ending" as const,
      /** The Withdrawal, not the cow: one cow has many over her life, and this notice is
       *  about one of them. Her id and tag travel in the params, so anything reading the
       *  notice can still find her. */
      entity: "withdrawal",
      entityId: withdrawalNoticeId(beast.id, until),
      params: {
        tag: beast.tagNumber,
        animalId: beast.id,
        until: until.toISOString(),
      },
    };
    // Deliberately sequential: a herd of concurrent upserts against one unique index buys
    // nothing but lock contention.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await raiseAlerts(tx, farmId, told, notice, now);
    raised.push(...rows.map((row) => ({ ...row, ...notice })));
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
 * written in. Trimmed and case-folded so "তড়কা " and "Anthrax" versus "anthrax" are not the
 * farm's problem; anything subtler than that is the Manager's to keep tidy in the list.
 */
export const isNotifiable = async (
  tx: Tx,
  farmId: string,
  disease: { bn: string; en?: string }
): Promise<{ id: string; nameBn: string } | null> => {
  const list = await tx.query.notifiableDisease.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    columns: { id: true, nameBn: true, nameEn: true },
  });
  const said = new Set(
    [disease.bn, disease.en]
      .filter(Boolean)
      .map((word) => word?.trim().toLowerCase())
  );
  const found = list.find((one) =>
    [one.nameBn, one.nameEn]
      .filter(Boolean)
      .some((listed) => said.has(listed?.trim().toLowerCase()))
  );
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
  }: {
    farmId: string;
    diagnosisId: string;
    disease: { bn: string; en?: string };
    animalId: string;
    penId: string;
    now: Date;
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
      await tx
        .update(sopInstance)
        .set({ state: "missed" })
        .where(eq(sopInstance.id, standing.instanceId));
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
): Promise<RaisedAlert[]> => {
  const people = await holdersOf(tx, farmId, ["owner", "manager"]);
  const notice = {
    kind: "notifiable_diagnosis" as const,
    entity: "diagnosis",
    entityId: told.diagnosisId,
    params: { tag: told.tagNumber, disease: told.disease },
  };
  const rows = await raiseAlerts(tx, farmId, people, notice, now);
  return rows.map((row) => ({ ...row, ...notice }));
};

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
): Promise<RaisedAlert[]> => {
  const managers = await holdersOf(tx, farmId, ["manager"]);
  const notice = {
    kind: "withdrawal_changed" as const,
    entity: "animal",
    entityId: withdrawalNoticeId(told.animalId, told.until ?? new Date(0)),
    params: {
      tag: told.tagNumber,
      until: told.until?.toISOString() ?? "",
    },
  };
  const rows = await raiseAlerts(tx, farmId, managers, notice, now);
  return rows.map((row) => ({ ...row, ...notice }));
};
