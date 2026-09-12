import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { diagnosis } from "@OpenFarm/db/schema/health";
import { mayCorrect } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import { diagnosisView } from "../health-store";
import { protectedProcedure } from "../index";
import { requireOnly, requirePersonalSession } from "../roles";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 180;
const MAX_ROWS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const condition = z.object({
  bn: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).optional(),
});

const note = z.string().trim().max(2000);

/** Every clinical act the Vet signs comes from their own account, never a Shed Phone. */
const theVetsOwnAct = () =>
  protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .use(requirePersonalSession());

/** The Diagnosis as it stands, for the trail to record either side of a Correction. */
const readDiagnosis = async (tx: Tx, id: string) => {
  const row = await tx.query.diagnosis.findFirst({
    where: { id },
    columns: { condition: true, conditionEn: true, note: true },
  });
  return row ?? null;
};

export const diagnosesRouter = {
  /**
   * The Vet's conclusion about one animal, recorded by the Vet themselves — wherever they
   * are, which is usually not here.
   *
   * It may answer an Observation, and then the animal's page reads as one chain: what the
   * round saw, and what the Vet made of it.
   */
  record: theVetsOwnAct()
    .input(
      z.object({
        animalTag: z.string().trim().min(1).max(32),
        /** The Observation this answers, when it answers one. */
        answers: z.string().optional(),
        condition,
        note: note.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const her = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.animalTag.toUpperCase(),
        },
        columns: { id: true },
      });
      if (!her) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.animalTag}`,
        });
      }
      if (input.answers) {
        const seen = await context.db.query.observation.findFirst({
          where: { id: input.answers, farmId: context.farm.id },
          columns: { animalId: true, withdrawnAt: true },
        });
        // The chain has to be one animal's. An Observation of another cow answered here
        // would put the Vet's conclusion in a history it was never about.
        if (!seen || seen.animalId !== her.id) {
          throw new ORPCError("BAD_REQUEST", {
            message: "That observation is not this animal's",
          });
        }
        // A withdrawn Observation is one the farm has taken back. Answering it would hang a
        // Diagnosis off a note nobody stands behind any more.
        if (seen.withdrawnAt) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "That observation was corrected; answer the one that stands in its place",
          });
        }
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "diagnosis",
          entityId: id,
          action: "create",
          after: {
            animalId: her.id,
            condition: input.condition.bn,
            note: input.note ?? null,
            answers: input.answers ?? null,
          },
        },
        (tx) =>
          tx.insert(diagnosis).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            observationId: input.answers ?? null,
            condition: input.condition.bn,
            conditionEn: input.condition.en ?? null,
            note: input.note ?? null,
            diagnosedBy: context.actor.id,
            diagnosedAt: now,
            recordedAt: now,
          })
      );
      return { id };
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
  correct: theVetsOwnAct()
    .input(
      z.object({
        id: z.string(),
        condition,
        note: note.optional(),
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const existing = await context.db.query.diagnosis.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, diagnosedBy: true, recordedAt: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND");
      }
      const verdict = mayCorrect({
        // Only their standing as the Vet is asked about. An in-house Vet who is also the
        // Manager would otherwise have this recorded under the Manager's Role — and the
        // Manager has no business in the clinical record at all.
        roles: ["vet"],
        isOwnEntry: existing.diagnosedBy === context.actor.id,
        isHealthEntry: true,
        recordedAt: existing.recordedAt,
        now: context.clock.now(),
        windows: correctionWindows(context.farm),
      });
      if (!verdict.allowed) {
        throw new ORPCError("FORBIDDEN", {
          message: "A diagnosis is the vet's own to correct",
          data: { refusal: refusalData(verdict.refusal) },
        });
      }
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "diagnosis",
        existing.id
      );
      await audit.write(
        {
          entity: "diagnosis",
          entityId: existing.id,
          action: "correct",
          reason: input.reason,
          roleUsed: verdict.role,
          supersedesId: previous?.id,
          before: (tx) => readDiagnosis(tx, existing.id),
          after: (tx) => readDiagnosis(tx, existing.id),
        },
        (tx) =>
          tx
            .update(diagnosis)
            .set({
              condition: input.condition.bn,
              conditionEn: input.condition.en ?? null,
              note: input.note ?? null,
            })
            .where(eq(diagnosis.id, existing.id))
      );
      return { id: existing.id };
    }),

  /**
   * What the rounds have seen and nobody has answered — the Vet's own screen, from wherever
   * they are.
   *
   * Every choice a round offers is recorded, including the ones that say she is fine, and
   * nothing in a Version marks which of them wants a Vet. So this is the whole of what has
   * not been answered, and the Vet narrows it by the word the farm used.
   */
  waiting: theVetsOwnAct()
    .input(
      z
        .object({
          saw: z.string().trim().max(60).optional(),
          days: z.number().int().min(1).max(MAX_DAYS).default(DEFAULT_DAYS),
        })
        .default(() => ({ days: DEFAULT_DAYS }))
    )
    .handler(async ({ context, input }) => {
      const since = new Date(
        context.clock.now().getTime() - input.days * DAY_MS
      );
      const rows = await context.db.query.observation.findMany({
        where: {
          farmId: context.farm.id,
          seenAt: { gte: since },
          withdrawnAt: { isNull: true },
          ...(input.saw ? { saw: input.saw } : {}),
        },
        orderBy: { seenAt: "desc" },
        limit: MAX_ROWS,
        with: {
          animal: { columns: { tagNumber: true } },
          observer: { columns: { name: true } },
          diagnoses: { columns: { id: true } },
        },
      });
      return rows
        .filter((seen) => seen.diagnoses.length === 0)
        .map(({ animal, observer, diagnoses: _answered, ...seen }) => ({
          id: seen.id,
          saw: seen.saw,
          sawLabel: seen.sawLabel,
          seenAt: seen.seenAt,
          tagNumber: animal.tagNumber,
          seenByName: observer?.name ?? null,
        }));
    }),

  /** What this Vet has concluded lately, newest first: their own work, to read and to put
   *  right. */
  mine: theVetsOwnAct()
    .input(
      z
        .object({
          days: z.number().int().min(1).max(MAX_DAYS).default(DEFAULT_DAYS),
        })
        .default(() => ({ days: DEFAULT_DAYS }))
    )
    .handler(async ({ context, input }) => {
      const since = new Date(
        context.clock.now().getTime() - input.days * DAY_MS
      );
      const rows = await context.db.query.diagnosis.findMany({
        where: {
          farmId: context.farm.id,
          diagnosedBy: context.actor.id,
          diagnosedAt: { gte: since },
        },
        orderBy: { diagnosedAt: "desc" },
        limit: MAX_ROWS,
        with: {
          animal: { columns: { tagNumber: true } },
          vet: { columns: { name: true } },
          answers: { columns: { saw: true, sawLabel: true, seenAt: true } },
        },
      });
      return rows.map(({ animal, ...row }) => ({
        ...diagnosisView(row),
        tagNumber: animal.tagNumber,
      }));
    }),
};
