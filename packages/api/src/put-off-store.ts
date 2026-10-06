import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, like, ne } from "@OpenFarm/db/operators";
import { excusedDose } from "@OpenFarm/db/schema/health";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { SopContent } from "@OpenFarm/domain";
import { OPEN_INSTANCE_STATES, isExitState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import type { SQL } from "drizzle-orm";

import type { Trail, Tx } from "./audit";
import { raiseDueInstances } from "./instances-store";
import { contentOf } from "./sop-content";
import { putOffCauseOf, putOffOf } from "./work-cause";
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
 * What kind of owed work this is, from the work itself and never from a skip's words: his Release, or one of his arrival
 * doses — work his arrival raised that gives a dose. A Pen's Campaign, a tick spray, any other dose: neither.
 */
export const putOffKindOf = (
  original: string,
  content: SopContent
): "release" | "arrival_dose" | null => {
  if (releases(content)) {
    return "release";
  }
  return givesADose(content) && ARRIVAL_CAUSE.test(original)
    ? "arrival_dose"
    : null;
};

/**
 * Owed work put off — its step skipped, or the work closed Missed — raised again for him in his Pen, the farm's put-off
 * days later, under the same Version: his Release while he is still in Quarantine, an arrival dose while he is still on
 * the farm. Again and again until it is done; a replay of the same skip raises nothing more, as its cause is the same.
 * Nothing for any other work.
 */
export const raiseThePutOff = async (
  tx: Tx,
  farmId: string,
  instanceId: string,
  at: Date,
  now: Date
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
  if (!(work?.animalId && work.cause && work.version)) {
    return;
  }
  // The farm has switched the procedure off: work it had begun is finished, and none raised again under it.
  if (work.definition.retiredAt) {
    return;
  }
  const content = contentOf(work.version);
  const before = putOffOf(work.cause);
  const original = before?.original ?? work.cause;
  const kind = putOffKindOf(original, content);
  if (!kind) {
    return;
  }
  const him = await tx.query.animal.findFirst({
    where: { id: work.animalId, farmId },
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
  await raiseDueInstances(
    tx,
    farmId,
    [
      {
        definitionId: work.definitionId,
        versionId: work.versionId,
        penId: him.penId,
        animalId: work.animalId,
        dueAt: new Date(at.getTime() + (farm?.putOffDays ?? 7) * DAY_MS),
        cause: putOffCauseOf(original, (before?.n ?? 0) + 1),
        graceMinutes: content.graceMinutes,
        assignedRole: content.assignedRole,
        checkerRole: content.checkerRole,
      },
    ],
    now
  );
};

/** Open raised-again work of these causes, called off — less the work being done right now, which is finishing. */
const callOffAgain = (
  tx: Tx,
  farmId: string,
  which: SQL | undefined,
  except: string | null,
  trail: Trail
) =>
  callOffWork(
    tx,
    farmId,
    and(which, except ? ne(sopInstance.id, except) : undefined) as SQL,
    { trail, by: "released" }
  );

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

/** His arrival dose given — on the work first raised, or on one raised again — so what else was raised for it is not owed. */
export const callOffPutOffDose = (
  tx: Tx,
  farmId: string,
  work: { id: string; cause: string | null },
  trail: Trail
) => {
  const original = putOffOf(work.cause)?.original ?? work.cause;
  return original && ARRIVAL_CAUSE.test(original)
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
