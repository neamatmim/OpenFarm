import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, like, ne } from "@OpenFarm/db/operators";
import { excusedDose } from "@OpenFarm/db/schema/health";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { SopContent } from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  comesRoundOnASchedule,
  isExitState,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import type { SQL } from "drizzle-orm";

import type { Trail, Tx } from "./audit";
import { raiseDueInstances } from "./instances-store";
import { contentOf } from "./sop-content";
import {
  campaignDoseKeyOf,
  isCampaignDoseKey,
  putOffCauseOf,
  putOffOf,
} from "./work-cause";
import type { CalledOffBy } from "./work-transitions";
import { callOffWork } from "./work-transitions";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a procedure lets a bull out of Quarantine: one of its Steps has the release's effect. */
const releases = (content: SopContent): boolean =>
  content.steps.some((step) => step.effect?.kind === "release");

/** Whether a procedure gives a dose: one of its Steps records a Treatment. */
const givesADose = (content: SopContent): boolean =>
  content.steps.some((step) => step.effect?.kind === "treatment");

/** A cause his arrival wrote: `arrival:<animal>:+<days>`. */
const ARRIVAL_CAUSE = /^arrival:[^:]+:\+\d+$/u;

/**
 * What kind of owed work this is, from the work itself and never from a skip's words: his Release, one of his arrival
 * doses — work his arrival raised that gives a dose — or her dose of a Pen's Campaign, put off. A tick spray, a
 * Prescription's dose, any other work: none of them.
 */
export const putOffKindOf = (
  original: string,
  content: SopContent
): "release" | "arrival_dose" | "campaign_dose" | null => {
  if (releases(content)) {
    return "release";
  }
  if (!givesADose(content)) {
    return null;
  }
  if (ARRIVAL_CAUSE.test(original)) {
    return "arrival_dose";
  }
  // Walked over a Pen and dosing each animal as a Campaign does, but on a Schedule: she is dosed when it comes round, and
  // one left out within a month of her sale is never raised again into her withdrawal.
  return isCampaignDoseKey(original) && !comesRoundOnASchedule(content)
    ? "campaign_dose"
    : null;
};

/**
 * Whose work put off this is, and the cause it is owed by: work about one animal is hers, under its own cause; her dose
 * on a Pen's Campaign is keyed afresh by the Campaign's work and her.
 */
const whoseIsIt = (
  work: { id: string; animalId: string | null; cause: string | null },
  campaignAnimalId: string | null | undefined
): { animalId: string | null; cause: string | null } =>
  !work.animalId && campaignAnimalId
    ? {
        animalId: campaignAnimalId,
        cause: campaignDoseKeyOf(work.id, campaignAnimalId),
      }
    : { animalId: work.animalId, cause: work.cause };

/**
 * A dose just raised again for her, held if she is Ready for Sale: given now, its withdrawal would hold up the sale she
 * is ready for. Owed still, and raised again if she goes back to Fattening. Without a trail to write it in, raised as
 * ever.
 */
const holdIfReady = async (
  tx: Tx,
  farmId: string,
  her: { animalId: string; state: string },
  kind: "release" | "arrival_dose" | "campaign_dose",
  { cause, trail }: { cause: string; trail?: Trail | null }
): Promise<void> => {
  if (kind === "release" || her.state !== "ready_for_sale" || !trail) {
    return;
  }
  await callOffWork(
    tx,
    farmId,
    and(
      eq(sopInstance.animalId, her.animalId),
      eq(sopInstance.cause, cause)
    ) as SQL,
    { trail, by: "held_for_sale" }
  );
};

/**
 * Refuses a dose passed as held for her sale for an animal not Ready for Sale: hers is owed now, and holding it would put
 * it off for a sale nobody has confirmed.
 */
export const assertReadyForSale = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animalId: string | null
): Promise<void> => {
  const her = animalId
    ? await tx.query.animal.findFirst({
        where: { id: animalId, farmId },
        columns: { state: true },
      })
    : undefined;
  if (her?.state !== "ready_for_sale") {
    throw new ORPCError("BAD_REQUEST", {
      message: "She is not Ready for Sale: give the dose, or say why it waits",
      data: { refusal: "not_ready_for_sale" },
    });
  }
};

/**
 * Owed work put off — its step skipped, or the work closed Missed — raised again for him in his Pen, the farm's put-off
 * days later, under the same Version: his Release while he is still in Quarantine, an arrival dose or a Campaign's dose
 * while he is still on the farm. Again and again until it is done; a replay of the same skip raises nothing more, as its
 * cause is the same. Nothing for any other work.
 *
 * A Pen's Campaign is work about the Pen, so the animal whose dose was skipped is named: her dose alone is raised again,
 * never the whole Pen walked a second time.
 */
export const raiseThePutOff = async (
  tx: Tx,
  farmId: string,
  instanceId: string,
  at: Date,
  now: Date,
  {
    campaignAnimalId,
    trail,
    dueAt,
  }: {
    /** On a Pen's Campaign, the animal whose dose was put off. */
    campaignAnimalId?: string | null;
    /** Where a dose held for her sale is written as called off; without one, it is raised as ever. */
    trail?: Trail | null;
    /** When it falls due, where not the farm's put-off days after `at`: a held dose is owed from the day she is back. */
    dueAt?: Date | null;
  } = {}
): Promise<void> => {
  const work = await tx.query.sopInstance.findFirst({
    where: { id: instanceId, farmId },
    columns: {
      definitionId: true,
      versionId: true,
      animalId: true,
      cause: true,
    },
    with: {
      version: { columns: { content: true } },
      definition: { columns: { retiredAt: true } },
    },
  });
  if (!work?.version) {
    return;
  }
  const { animalId, cause } = whoseIsIt(
    { id: instanceId, ...work },
    campaignAnimalId
  );
  if (!(animalId && cause)) {
    return;
  }
  // The farm has switched the procedure off: work it had begun is finished, and none raised again under it.
  if (work.definition.retiredAt) {
    return;
  }
  const content = contentOf(work.version);
  const before = putOffOf(cause);
  const original = before?.original ?? cause;
  const kind = putOffKindOf(original, content);
  if (!kind) {
    return;
  }
  const him = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: { state: true, penId: true },
  });
  const stillOwed =
    him !== undefined &&
    (kind === "release" ? him.state === "quarantine" : !isExitState(him.state));
  if (!(him && stillOwed)) {
    return;
  }
  const farm = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { putOffDays: true },
  });
  const next = putOffCauseOf(original, (before?.n ?? 0) + 1);
  await raiseDueInstances(
    tx,
    farmId,
    [
      {
        definitionId: work.definitionId,
        versionId: work.versionId,
        penId: him.penId,
        animalId,
        dueAt:
          dueAt ?? new Date(at.getTime() + (farm?.putOffDays ?? 7) * DAY_MS),
        cause: next,
        graceMinutes: content.graceMinutes,
        assignedRole: content.assignedRole,
        checkerRole: content.checkerRole,
      },
    ],
    now
  );
  await holdIfReady(tx, farmId, { animalId, state: him.state }, kind, {
    cause: next,
    trail,
  });
};

/** Open raised-again work of these causes, called off — less the work being done right now, which is finishing. */
const callOffAgain = (
  tx: Tx,
  farmId: string,
  which: SQL | undefined,
  except: string | null,
  trail: Trail,
  by: CalledOffBy = "released"
) =>
  callOffWork(
    tx,
    farmId,
    and(which, except ? ne(sopInstance.id, except) : undefined) as SQL,
    { trail, by }
  );

/** Put-off work's cause: `<original>:again:<n>`. */
const AGAIN = "%:again:%";

/**
 * Confirmed Ready for Sale: the doses put off and raised again for her, still open, are held — called off as held for
 * her sale, so nobody gives a dose whose withdrawal would hold the sale up. Her first arrival doses are not touched.
 */
export const holdPutOffDoses = (
  tx: Tx,
  farmId: string,
  animalId: string,
  trail: Trail,
  except: string | null = null
) =>
  callOffAgain(
    tx,
    farmId,
    and(eq(sopInstance.animalId, animalId), like(sopInstance.cause, AGAIN)),
    except,
    trail,
    "held_for_sale"
  );

/**
 * Whether a held dose is owed her still: not given since — a skip put right to say it was, on the work first raised or
 * one raised again — and, for an arrival dose, not excused by the Vet.
 */
const stillOwedHer = async (
  tx: Tx,
  farmId: string,
  animalId: string,
  original: string,
  definitionId: string
): Promise<boolean> => {
  const chain = await tx.query.sopInstance.findMany({
    where: {
      farmId,
      animalId,
      OR: [{ cause: original }, { cause: { like: `${original}:again:%` } }],
    },
    columns: { id: true },
  });
  // Her dose of a Pen's Campaign was first asked on the Pen's work, which her key names.
  const campaignWork = isCampaignDoseKey(original)
    ? original.split(":")[1]
    : undefined;
  const ids = [
    ...chain.map((one) => one.id),
    ...(campaignWork ? [campaignWork] : []),
  ];
  const given = await tx.query.treatment.findFirst({
    where: {
      farmId,
      animalId,
      instanceId: { in: ids },
      givenAt: { isNotNull: true },
    },
    columns: { id: true },
  });
  if (given) {
    return false;
  }
  if (!ARRIVAL_CAUSE.test(original)) {
    return true;
  }
  const excused = await tx.query.excusedDose.findFirst({
    where: { farmId, animalId, definitionId },
    columns: { id: true },
  });
  return !excused;
};

/**
 * Back to Fattening unsold: each dose held for her sale is owed again, raised once more for her and due the day she is
 * back — the latest held of each, as a skip would have raised it.
 */
export const raiseHeldDoses = async (
  tx: Tx,
  farmId: string,
  animalId: string,
  at: Date,
  now: Date,
  trail: Trail
): Promise<void> => {
  const held = await tx.query.sopInstance.findMany({
    where: {
      farmId,
      animalId,
      state: "called_off",
      calledOffBy: "held_for_sale",
    },
    columns: { id: true, cause: true, definitionId: true },
    orderBy: { id: "asc" },
  });
  // The latest raising of each, by its count: one held, back, and held again has two, and the second is the one owed.
  const latest = new Map<
    string,
    { id: string; n: number; definitionId: string }
  >();
  for (const one of held) {
    const found = putOffOf(one.cause);
    if (found && found.n > (latest.get(found.original)?.n ?? 0)) {
      latest.set(found.original, {
        id: one.id,
        n: found.n,
        definitionId: one.definitionId,
      });
    }
  }
  for (const [original, one] of latest) {
    // oxlint-disable-next-line no-await-in-loop -- one held dose after another, each its own work
    if (await stillOwedHer(tx, farmId, animalId, original, one.definitionId)) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await raiseThePutOff(tx, farmId, one.id, at, now, { trail, dueAt: at });
    }
  }
};

/**
 * His Releases raised again and still open, called off: he is out of Quarantine, by the Release or by hand, and owes no
 * more of them. Found by their cause — the state he entered Quarantine by, put off.
 */
export const callOffPutOffReleases = (
  tx: Tx,
  farmId: string,
  animalId: string,
  trail: Trail,
  except: string | null = null
) =>
  callOffAgain(
    tx,
    farmId,
    and(
      eq(sopInstance.animalId, animalId),
      like(sopInstance.cause, `state:${animalId}:quarantine:%:again:%`)
    ),
    except,
    trail
  );

/**
 * His arrival dose or her Campaign dose given — on the work first raised, or on one raised again — so what else was
 * raised for it is not owed. On the Pen's Campaign itself her dose is keyed by the animal it was given to.
 */
export const callOffPutOffDose = (
  tx: Tx,
  farmId: string,
  work: { id: string; cause: string | null; animalId: string | null },
  trail: Trail,
  campaignAnimalId?: string | null
) => {
  const { cause } = whoseIsIt(work, campaignAnimalId);
  const original = putOffOf(cause)?.original ?? cause;
  return original &&
    (ARRIVAL_CAUSE.test(original) || isCampaignDoseKey(original))
    ? callOffAgain(
        tx,
        farmId,
        like(sopInstance.cause, `${original}:again:%`),
        work.id,
        trail
      )
    : Promise.resolve([]);
};

/** One arrival dose he still owes — or that the Vet excused: the procedure's name, when it was first due, and when it
 *  comes round next. */
export interface DoseOwed {
  definitionId: string;
  name: { bn: string; en?: string };
  firstDueAt: Date;
  /** The open work it is owed on, if any is open: the work first raised, or one raised again. */
  nextDueAt: Date | null;
  /** The Vet's written reason it is not needed, where they have written one: then it is not owed. */
  excused: { reason: string } | null;
}

/**
 * The arrival doses he still owes, read from the work and never from a skip's words: work his arrival raised that gives
 * a dose, due by now, with no dose of it given for him — on the work first raised or one raised again. Work all Called
 * Off (the procedure retired, or he left) owes nothing. A farm that adopted no dose procedure owes nothing.
 */
export const arrivalDosesOwed = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animalId: string,
  now: Date
): Promise<DoseOwed[]> => {
  const work = await tx.query.sopInstance.findMany({
    where: { farmId, animalId, cause: { like: `arrival:${animalId}:+%` } },
    columns: {
      id: true,
      definitionId: true,
      state: true,
      dueAt: true,
      cause: true,
    },
    with: { version: { columns: { content: true } } },
    orderBy: { dueAt: "asc", id: "asc" },
  });
  const doses = work.filter(
    (one) =>
      one.cause !== null &&
      one.version !== null &&
      putOffKindOf(
        putOffOf(one.cause)?.original ?? one.cause,
        contentOf(one.version)
      ) === "arrival_dose"
  );
  if (doses.length === 0) {
    return [];
  }
  const given = await tx.query.treatment.findMany({
    where: {
      farmId,
      animalId,
      instanceId: { in: doses.map((one) => one.id) },
      givenAt: { isNotNull: true },
    },
    columns: { instanceId: true },
  });
  const givenOn = new Set(given.map((one) => one.instanceId));
  const excuses = await tx.query.excusedDose.findMany({
    where: { farmId, animalId },
    columns: { definitionId: true, reason: true },
  });
  const excusedFor = new Map(
    excuses.map((one) => [one.definitionId, { reason: one.reason }])
  );
  const chains = new Map<string, typeof doses>();
  for (const one of doses) {
    const original = putOffOf(one.cause)?.original ?? one.cause ?? "";
    chains.set(original, [...(chains.get(original) ?? []), one]);
  }
  return [...chains.values()].flatMap((chain) => {
    const [first] = chain;
    const open = chain.filter((one) =>
      (OPEN_INSTANCE_STATES as readonly string[]).includes(one.state)
    );
    const owed =
      first !== undefined &&
      first.dueAt <= now &&
      !chain.some((one) => givenOn.has(one.id)) &&
      !chain.every((one) => one.state === "called_off");
    return owed && first.version
      ? [
          {
            definitionId: first.definitionId,
            name: contentOf(first.version).name,
            firstDueAt: first.dueAt,
            nextDueAt: open.at(-1)?.dueAt ?? null,
            excused: excusedFor.get(first.definitionId) ?? null,
          },
        ]
      : [];
  });
};

/**
 * Refuses to let him out of Quarantine — by the Release Step or by hand, one gate for both doors — while an arrival dose
 * is still owed him and the Vet has not written why it is not needed. Names the doses. A farm that adopted no dose
 * procedure owes nothing, and the Release goes ahead as it always has.
 */
export const assertNoDoseOwed = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animalId: string,
  now: Date
): Promise<void> => {
  const doses = await arrivalDosesOwed(tx, farmId, animalId, now);
  const owed = doses.filter((one) => one.excused === null);
  if (owed.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Still owed: ${owed.map((one) => one.name.en ?? one.name.bn).join(", ")}`,
      data: {
        refusal: "arrival_dose_owed",
        /** Their names, said as the farm says them. */
        doses: owed.map((one) => one.name.bn).join(", "),
      },
    });
  }
};

/**
 * The Vet's written reason one arrival dose is not needed for him: kept, and what was raised again for it is called off.
 * Refused for a dose he does not owe — given, not due, or excused already.
 */
export const excuseArrivalDose = async (
  tx: Tx,
  input: {
    farmId: string;
    animalId: string;
    definitionId: string;
    reason: string;
    vetId: string;
    now: Date;
    trail: Trail;
  }
): Promise<void> => {
  const owed = await arrivalDosesOwed(
    tx,
    input.farmId,
    input.animalId,
    input.now
  );
  const this_ = owed.find(
    (one) => one.definitionId === input.definitionId && one.excused === null
  );
  if (!this_) {
    throw new ORPCError("BAD_REQUEST", {
      message: "He does not owe that dose",
      data: { refusal: "dose_not_owed" },
    });
  }
  await tx.insert(excusedDose).values({
    id: uuidv7(input.now),
    farmId: input.farmId,
    animalId: input.animalId,
    definitionId: input.definitionId,
    reason: input.reason,
    excusedBy: input.vetId,
    excusedAt: input.now,
  });
  await callOffWork(
    tx,
    input.farmId,
    and(
      eq(sopInstance.animalId, input.animalId),
      eq(sopInstance.definitionId, input.definitionId),
      like(sopInstance.cause, `arrival:${input.animalId}:+%:again:%`)
    ) as SQL,
    { trail: input.trail, by: "excused" }
  );
};

/**
 * The Vet's excuse taken back — the card from the other farm was for another bull: the dose is owed again, and raised
 * again for him after the farm's days as one put off is. Refused once he has left Quarantine, whose Release went ahead
 * on the excuse: his doses are then the Vet's to give him in the herd.
 */
export const takeBackTheExcuse = async (
  tx: Tx,
  input: { farmId: string; animalId: string; definitionId: string; now: Date }
): Promise<void> => {
  const excuse = await tx.query.excusedDose.findFirst({
    where: {
      farmId: input.farmId,
      animalId: input.animalId,
      definitionId: input.definitionId,
    },
    columns: { id: true },
  });
  if (!excuse) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That dose was not excused",
      data: { refusal: "not_excused" },
    });
  }
  const him = await tx.query.animal.findFirst({
    where: { id: input.animalId, farmId: input.farmId },
    columns: { state: true },
  });
  if (him?.state !== "quarantine") {
    throw new ORPCError("BAD_REQUEST", {
      message: "He has been released on it: give the dose in the herd",
      data: { refusal: "released_on_it" },
    });
  }
  await tx.delete(excusedDose).where(eq(excusedDose.id, excuse.id));
  // Raised again from the last work that asked for it, as a skip would have raised it.
  const last = await tx.query.sopInstance.findFirst({
    where: {
      farmId: input.farmId,
      animalId: input.animalId,
      definitionId: input.definitionId,
      cause: { like: `arrival:${input.animalId}:+%` },
    },
    orderBy: { dueAt: "desc", id: "desc" },
    columns: { id: true },
  });
  if (last) {
    await raiseThePutOff(tx, input.farmId, last.id, input.now, input.now);
  }
};
