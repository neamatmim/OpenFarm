import { uuidv7 } from "@OpenFarm/db/ids";
import { sql } from "@OpenFarm/db/operators";
import { diagnosis } from "@OpenFarm/db/schema/health";
import type { observation } from "@OpenFarm/db/schema/observation";
import { EXIT_STATES, isExitState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  diagnosisCorrection,
  diagnosisCorrectionInput,
} from "../corrections/diagnosis";
import {
  MAX_SEEN_ROWS,
  diagnosisNoteInput,
  diseaseInput,
  readDiagnosis,
  isNotifiable,
  raiseNotifiableAlerts,
  raiseTheReport,
  seenLately,
  seenLatelyInput,
  theConclusionAndWhatFollowed,
  withPrescriptions,
} from "../health-store";
import { loadLiveAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import type { RaisedAlert } from "../instances-store";
import { pushRaised } from "../push-send";
import { requireOnly, requirePersonalSession } from "../roles";
import { clinicalRecordsInScope, requireClinicalInScope } from "../scope";
import { textTheSafetyAlerts } from "../sms-send";

/** The Vet visits about weekly, so a fortnight is what they need to catch up on. */
const VET_WINDOW_DAYS = 14;

/**
 * A Diagnosis is the Vet's act, in law and so in the record: antibiotics require a
 * registered practitioner's own prescription (BVC Act 2019), and a farm that lets the
 * Manager type one in on the Vet's behalf has no prescription at all.
 */
const VET_ONLY = {
  message:
    "Only the Vet records a Diagnosis, from their own account — it is their act, not the farm's",
  reason: "vet_only",
} as const;

/** Every clinical act the Vet signs comes from their own account, never a Shed Phone. */
const theVetsOwnAct = protectedProcedure
  .use(requireOnly("vet", VET_ONLY, { visitingVet: true }))
  .use(requirePersonalSession());

/**
 * The Observation this Diagnosis claims to answer has to be one the farm still stands behind,
 * and this animal's. Another cow's would put the Vet's conclusion in a history it was never
 * about; a withdrawn one would hang it off a note somebody has taken back.
 */
const assertAnswerable = async (
  tx: Tx,
  {
    farmId,
    observationId,
    animalId,
  }: { farmId: string; observationId: string; animalId: string }
) => {
  const seen = await tx.query.observation.findFirst({
    where: { id: observationId, farmId },
    columns: { animalId: true, withdrawnAt: true },
  });
  if (!seen || seen.animalId !== animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That observation is not this animal's",
    });
  }
  if (seen.withdrawnAt) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "That observation was corrected; answer the one that stands in its place",
    });
  }
};

/** No Diagnosis answers this Observation yet. Asked of the database rather than of the rows
 *  that came back: filtering a page of answered ones in JavaScript would hide the queue
 *  behind a fortnight of "she is well". */
const unanswered = (table: typeof observation) =>
  sql`not exists (select 1 from ${diagnosis} where ${diagnosis.observationId} = ${table.id})`;

/**
 * Whether the farm owes the office a letter about this Diagnosis, and everything that follows
 * from it: the report, the work to deliver it, and telling the people who answer for it.
 *
 * Told whether or not a procedure exists to raise. Somebody has to know, and a farm missing the
 * procedure needs telling most of all.
 */
const reportIfNotifiable = async (
  tx: Tx,
  {
    farmId,
    diagnosisId,
    named,
    animal,
    now,
  }: {
    farmId: string;
    diagnosisId: string;
    /** What the Vet called it. */
    named: { bn: string; en?: string };
    animal: { id: string; penId: string; tagNumber: string };
    now: Date;
  }
): Promise<{
  notifiable: boolean;
  instanceId: string | null;
  alerts: RaisedAlert[];
}> => {
  const listed = await isNotifiable(tx, farmId, named);
  if (!listed) {
    return { notifiable: false, instanceId: null, alerts: [] };
  }
  const raised = await raiseTheReport(tx, {
    farmId,
    diagnosisId,
    diseaseId: listed.id,
    animalId: animal.id,
    penId: animal.penId,
    now,
  });
  const alerts = await raiseNotifiableAlerts(
    tx,
    farmId,
    { diagnosisId, tagNumber: animal.tagNumber, disease: named.bn },
    now
  );
  return { notifiable: true, instanceId: raised.instanceId, alerts };
};

export const diagnosesRouter = {
  /**
   * The Vet's conclusion about one animal, recorded by the Vet themselves — wherever they
   * are, which is usually not here.
   *
   * It may answer an Observation, and then the animal's page reads as one chain: what the
   * round saw, and what the Vet made of it.
   */
  record: theVetsOwnAct
    .input(
      z.object({
        animalTag: z.string().trim().min(1).max(32),
        /** The Observation this answers, when it answers one. */
        answers: z.string().optional(),
        disease: diseaseInput,
        note: diagnosisNoteInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      let notifiable = false;
      let reporting: string | null = null;
      let alerts: RaisedAlert[] = [];
      // The animal, the Observation and the insert are all read and written inside the one
      // transaction: checking first and writing afterwards would let the trail record a
      // Diagnosis against a cow who left the farm between the two.
      await audited(context).write(
        {
          entity: "diagnosis",
          entityId: id,
          action: "create",
          after: (tx) => readDiagnosis(tx, id),
        },
        async (tx) => {
          const her = await loadLiveAnimal(
            tx,
            context.farm.id,
            input.animalTag.toUpperCase()
          );
          requireClinicalInScope(context.scope, her.id);
          if (input.answers) {
            await assertAnswerable(tx, {
              farmId: context.farm.id,
              observationId: input.answers,
              animalId: her.id,
            });
          }
          await tx.insert(diagnosis).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            observationId: input.answers ?? null,
            disease: input.disease.bn,
            diseaseEn: input.disease.en ?? null,
            note: input.note ?? null,
            diagnosedBy: context.actor.id,
            diagnosedAt: now,
            recordedAt: now,
          });
          // If the farm's list says this one must be reported, the letter is owed and the work
          // to deliver it is raised here and now, due now: the Act says without delay, and a
          // farm that waits for somebody to open an app has waited.
          const owed = await reportIfNotifiable(tx, {
            farmId: context.farm.id,
            diagnosisId: id,
            named: input.disease,
            animal: her,
            now,
          });
          ({ notifiable, instanceId: reporting, alerts } = owed);
        }
      );
      // Outside the transaction, never inside it: a push is a call to somebody else's server,
      // and a hung one would hold a lock the whole shed is waiting on. A text message is the
      // same, and this is one of the two the farm sends them for.
      await pushRaised(context, alerts, now);
      await textTheSafetyAlerts(context, alerts);
      return { id, notifiable, reportInstanceId: reporting };
    }),

  /**
   * Puts a Diagnosis right. Nothing is deleted and nothing is overwritten silently: the
   * Correction carries a reason and supersedes the entry before it, so the trail holds every
   * conclusion the Vet has drawn about this animal and the order they drew them in.
   *
   * The window is the Vet's own, and it does not close — an animal's clinical history matters
   * for as long as she is on the farm. It is theirs alone: another Vet's conclusion is not
   * this Vet's to change, and the Manager may read it but never write it (roles matrix).
   */
  correct: theVetsOwnAct
    .input(diagnosisCorrectionInput)
    .handler(async ({ context, input }) => {
      const { id, notifiable, reportInstanceId } = await correct(
        context,
        diagnosisCorrection,
        input
      );
      return { id, notifiable, reportInstanceId };
    }),

  /**
   * What the rounds have seen and nobody has answered — the Vet's own screen, from wherever
   * they are.
   *
   * Every choice a round offers is recorded, including the ones that say she is fine, and
   * nothing in a Version marks which of them wants a Vet. So this is the whole of what has
   * not been answered, and the Vet narrows it by the word the farm used.
   */
  waiting: theVetsOwnAct
    .input(seenLatelyInput(VET_WINDOW_DAYS))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.observation.findMany({
        where: {
          ...seenLately({
            farmId: context.farm.id,
            saw: input.saw,
            days: input.days,
            now: context.clock.now(),
          }),
          RAW: unanswered,
          // Only about an animal still here: one sold or dead has nothing left to diagnose, and the farm refuses a
          // Diagnosis of her — left in the list, her cough would wait for ever and count in the Vet's figure.
          animal: { state: { notIn: [...EXIT_STATES] } },
          ...clinicalRecordsInScope(context.scope),
        },
        orderBy: { seenAt: "desc" },
        limit: MAX_SEEN_ROWS,
        with: {
          animal: { columns: { tagNumber: true } },
          observer: { columns: { name: true } },
        },
      });
      return rows.map(({ animal, observer, ...seen }) => ({
        id: seen.id,
        saw: seen.saw,
        sawLabel: seen.sawLabel,
        note: seen.note,
        seenAt: seen.seenAt,
        tagNumber: animal.tagNumber,
        seenByName: observer?.name ?? null,
      }));
    }),

  /** What this Vet has concluded lately, newest first: their own work, to read and to put
   *  right. */
  mine: theVetsOwnAct
    .input(seenLatelyInput(VET_WINDOW_DAYS))
    .handler(async ({ context, input }) => {
      const { seenAt } = seenLately({
        farmId: context.farm.id,
        days: input.days,
        now: context.clock.now(),
      });
      const rows = await context.db.query.diagnosis.findMany({
        where: {
          farmId: context.farm.id,
          diagnosedBy: context.actor.id,
          diagnosedAt: seenAt,
          // A closed Case takes the animal out of a visiting Vet's sight, their own past conclusions included.
          ...clinicalRecordsInScope(context.scope),
        },
        orderBy: { diagnosedAt: "desc" },
        limit: MAX_SEEN_ROWS,
        with: {
          animal: { columns: { tagNumber: true, state: true } },
          vet: { columns: { name: true } },
          answers: { columns: { saw: true, sawLabel: true, seenAt: true } },
          // What they ordered for it, so the Vet reads their own conclusion and the course
          // that followed in one place rather than two.
          ...withPrescriptions,
        },
      });
      return rows.map(({ animal, ...row }) => ({
        ...theConclusionAndWhatFollowed(row),
        tagNumber: animal.tagNumber,
        /** Still on the farm: a course is written only for an animal who is, so one who left is offered none. */
        stillHere: !isExitState(animal.state),
      }));
    }),
};
