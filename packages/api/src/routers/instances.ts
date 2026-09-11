import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import {
  completionPhoto,
  sopInstance,
  stepCompletion,
} from "@OpenFarm/db/schema/instance";
import type { SopContent, Step } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";
import {
  animalsForInstance,
  dueSlotsFor,
  farmDayRange,
  raiseDueInstances,
} from "../instances-store";
import { requireRole } from "../roles";

const PHOTO_MAX_BYTES = 2_000_000;

const evidenceValue = z.union([z.boolean(), z.number(), z.string()]);

const completionInput = z.object({
  instanceId: z.string(),
  stepId: z.string().trim().min(1),
  animalTag: z.string().trim().optional(),
  /** One value per Evidence on the Step, in order. */
  evidence: z.array(evidenceValue).default([]),
  /** Set when the person was warned a number was outside its range and went ahead. */
  outOfRange: z.string().trim().max(120).optional(),
  skipReason: z.string().trim().max(120).optional(),
  photo: z
    .object({
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z.string().min(1).max(PHOTO_MAX_BYTES),
    })
    .optional(),
  /** The phone's clock, for work captured offline. */
  recordedAt: z.coerce.date().optional(),
});

const contentOf = (version: { content: unknown }): SopContent =>
  version.content as SopContent;

/** The animal a per-animal Step is being recorded against — refusing one from another Pen,
 *  and refusing an animal at all for a Step that runs once. */
const resolveStepAnimal = async (
  tx: Tx,
  farmId: string,
  step: Step,
  instancePenId: string,
  animalTag: string | undefined
): Promise<string | null> => {
  if (!step.repeatPerAnimal) {
    if (animalTag) {
      throw new ORPCError("BAD_REQUEST", {
        message: "This step is recorded once",
      });
    }
    return null;
  }
  if (!animalTag) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step is recorded per animal",
    });
  }
  const beast = await tx.query.animal.findFirst({
    where: { farmId, tagNumber: animalTag.toUpperCase() },
    columns: { id: true, penId: true },
  });
  if (!beast || beast.penId !== instancePenId) {
    throw new ORPCError("NOT_FOUND", {
      message: "That animal is not in this pen",
    });
  }
  return beast.id;
};

/** The Step this Version declares, or nothing. */
const stepOf = (content: SopContent, stepId: string): Step => {
  const step = content.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new ORPCError("NOT_FOUND", {
      message: `No step ${stepId} in this version`,
    });
  }
  return step;
};

/** An Instance a person may work: theirs by Pen, and pinned or claimed by nobody else. */
const assertMayWork = (
  context: {
    roleUsed: string | null;
    penIds: string[];
    actor: { id: string };
    roles: string[];
    device: unknown;
  },
  instance: {
    penId: string;
    assignedTo: string | null;
    claimedBy: string | null;
    assignedRole: string;
  }
) => {
  // The Instance says who does this work; holding some other Role is not enough. The Owner
  // and the Manager may always step in — someone has to be able to unstick a shift.
  const runsTheFarm =
    context.roles.includes("owner") || context.roles.includes("manager");
  if (!(runsTheFarm || context.roles.includes(instance.assignedRole))) {
    throw new ORPCError("FORBIDDEN", {
      message: `This work is for ${instance.assignedRole}`,
    });
  }
  // A Vet's clinical work is signed on their own phone, never a shared one (ADR 0003).
  if (instance.assignedRole === "vet" && context.device) {
    throw new ORPCError("FORBIDDEN", {
      message: "This can only be done from your own phone, not a shed phone",
    });
  }
  if (
    context.roleUsed === "staff" &&
    !context.penIds.includes(instance.penId)
  ) {
    throw new ORPCError("FORBIDDEN", { message: "That pen is not yours" });
  }
  if (instance.assignedTo && instance.assignedTo !== context.actor.id) {
    throw new ORPCError("FORBIDDEN", {
      message: "This is pinned to someone else",
    });
  }
  if (instance.claimedBy && instance.claimedBy !== context.actor.id) {
    throw new ORPCError("FORBIDDEN", {
      message: "Someone else is working on this",
    });
  }
};

/** A Step is either skipped with a reason — only where it repeats per animal — or done with
 *  everything the Version marks required. Checked per slot, not by count: a Step with an
 *  optional note and a required number is not satisfied by filling only the note. A photo
 *  arrives in its own field rather than in the evidence array, so it counts for its slot. */
const assertEvidenceComplete = (
  step: Step,
  evidence: unknown[],
  skipping: boolean,
  hasPhoto: boolean
): void => {
  if (skipping) {
    if (!step.repeatPerAnimal) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only a per-animal step can be skipped",
      });
    }
    return;
  }
  const missing = step.evidence
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => {
      if (!item.required) {
        return false;
      }
      if (item.type === "photo") {
        return !hasPhoto;
      }
      const value = evidence[index];
      return value === undefined || value === null || value === "";
    });
  if (missing.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step needs everything marked required",
      data: { missing: missing.map(({ index }) => index) },
    });
  }
};

/** Staff see only their assigned Pens; everyone else sees the Pen they asked for, or all. */
const penFilter = (
  assigned: string[] | null,
  requested: string | undefined
) => {
  if (!assigned) {
    return requested ? { penId: requested } : {};
  }
  const visible = requested
    ? assigned.filter((id) => id === requested)
    : assigned;
  return { penId: { in: visible } };
};

export const instancesRouter = {
  /**
   * Raises the Instances the farm's day needs. Idempotent, so the phone and the office can
   * both call it on open; a scheduled job replaces that later.
   */
  ensureDue: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const definitions = await context.db.query.sopDefinition.findMany({
        where: { farmId: context.farm.id, retiredAt: { isNull: true } },
        with: { currentVersion: true },
      });
      const sops = definitions
        .filter((definition) => definition.currentVersion)
        .map((definition) => ({
          definitionId: definition.id,
          versionId: definition.currentVersion?.id ?? "",
          content: contentOf({ content: definition.currentVersion?.content }),
        }));
      const animals = await context.db.query.animal.findMany({
        where: { farmId: context.farm.id },
        columns: { penId: true, side: true, state: true },
      });
      const slots = dueSlotsFor(now, sops, animals);
      if (slots.length === 0) {
        return { raised: 0 };
      }
      let raised = 0;
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: `schedule:${now.toISOString().slice(0, 10)}`,
          action: "create",
          after: { slots: slots.length },
        },
        async (tx) => {
          raised = await raiseDueInstances(tx, context.farm.id, slots, now);
        }
      );
      return { raised };
    }),

  /** Today's work: what this person can pick up, newest due first. */
  today: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ penId: z.string().optional() }).default({}))
    .handler(({ context, input }) => {
      const scoped = context.roleUsed === "staff";
      if (scoped && context.penIds.length === 0) {
        return [];
      }
      // Today means the farm's day: yesterday's unfinished work belongs on the Overdue
      // list (ticket 10), not on the phone's list of what to do now.
      const { from, to } = farmDayRange(context.clock.now());
      return context.db.query.sopInstance.findMany({
        where: {
          farmId: context.farm.id,
          state: { in: ["due", "in_progress", "sent_back"] },
          dueAt: { gte: from, lt: to },
          // Both filters must hold: a Staff member asking for one Pen gets that Pen only
          // if it is theirs, rather than silently getting all of theirs.
          ...penFilter(scoped ? context.penIds : null, input.penId),
        },
        with: {
          version: { columns: { content: true, number: true } },
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
        },
        orderBy: { dueAt: "asc" },
      });
    }),

  /** Everything the pen board needs: the Version's Steps, the Pen's animals, and what has
   *  already been recorded. */
  get: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const instance = await context.db.query.sopInstance.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        with: {
          version: true,
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
          completions: true,
        },
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND");
      }
      const content = contentOf(instance.version);
      const animals = content.steps.some((step) => step.repeatPerAnimal)
        ? await animalsForInstance(
            context.db,
            context.farm.id,
            instance.penId,
            content
          )
        : [];
      return { ...instance, content, animals };
    }),

  /** Claiming is exclusive: the first person to take it is the one working it. */
  claim: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          after: { claimedBy: context.actor.id },
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.id, farmId: context.farm.id },
            columns: {
              penId: true,
              assignedTo: true,
              claimedBy: true,
              state: true,
              assignedRole: true,
            },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          assertMayWork(context, instance);
          // Only an unclaimed Instance can be claimed, so two phones cannot both take it.
          const [row] = await tx
            .update(sopInstance)
            .set({
              claimedBy: context.actor.id,
              claimedAt: now,
              state: "in_progress",
            })
            .where(
              and(eq(sopInstance.id, input.id), isNull(sopInstance.claimedBy))
            )
            .returning({ id: sopInstance.id });
          if (!row && instance.claimedBy !== context.actor.id) {
            throw new ORPCError("CONFLICT", {
              message: "Someone else took this first",
            });
          }
        }
      );
      return { id: input.id, claimed: true };
    }),

  /** The Manager pins an Instance to a person, or moves it to someone else. */
  assign: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string(), userId: z.string().nullable() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          after: { assignedTo: input.userId },
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.id, farmId: context.farm.id },
            columns: { state: true, assignedRole: true },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          if (instance.state === "completed" || instance.state === "approved") {
            throw new ORPCError("BAD_REQUEST", {
              message: "Finished work cannot be reassigned",
            });
          }
          if (input.userId) {
            // Pinning to someone who cannot work it would strand the Instance: nobody else
            // may touch it, and they are not on this farm to pick it up.
            const target = await tx.query.user.findFirst({
              where: { id: input.userId },
              columns: { id: true },
              with: {
                roles: { where: { farmId: context.farm.id, ...ACTIVE_ROLE } },
              },
            });
            // Whoever it is pinned to must be able to work it — the Role the Instance is
            // for, or the Owner or Manager stepping in, exactly as assertMayWork allows.
            const held = target?.roles.map((role) => role.role) ?? [];
            const canWorkIt =
              held.includes(instance.assignedRole) ||
              held.includes("owner") ||
              held.includes("manager");
            if (!canWorkIt) {
              throw new ORPCError("BAD_REQUEST", {
                message: `That person cannot do ${instance.assignedRole} work on this farm`,
              });
            }
          }
          await tx
            .update(sopInstance)
            .set({
              assignedTo: input.userId,
              assignedBy: context.actor.id,
              // Reassigning takes it out of the previous person's hands.
              claimedBy: null,
              claimedAt: null,
              state: "due",
            })
            .where(
              and(
                eq(sopInstance.id, input.id),
                eq(sopInstance.farmId, context.farm.id)
              )
            );
        }
      );
      return { id: input.id, assignedTo: input.userId };
    }),

  /** Records one Step — once per animal where the Step repeats. Recording again corrects it. */
  completeStep: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(completionInput)
    .handler(async ({ context, input }) => {
      const receivedAt = context.clock.now();
      const completionId = uuidv7(receivedAt);
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.instanceId,
          action: "update",
          after: { stepId: input.stepId, animalTag: input.animalTag ?? null },
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.instanceId, farmId: context.farm.id },
            with: { version: { columns: { content: true } } },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          if (instance.state === "completed" || instance.state === "approved") {
            throw new ORPCError("BAD_REQUEST", {
              message: "This work is already finished",
            });
          }
          assertMayWork(context, instance);
          const content = contentOf(instance.version);
          const step = stepOf(content, input.stepId);
          const animalId = await resolveStepAnimal(
            tx,
            context.farm.id,
            step,
            instance.penId,
            input.animalTag
          );
          const skipping = Boolean(input.skipReason);
          assertEvidenceComplete(
            step,
            input.evidence,
            skipping,
            Boolean(input.photo)
          );

          const values = {
            farmId: context.farm.id,
            instanceId: input.instanceId,
            stepId: input.stepId,
            animalId,
            animalKey: animalId ?? "",
            status: skipping ? ("skipped" as const) : ("done" as const),
            skipReason: input.skipReason ?? null,
            evidence: input.evidence,
            outOfRange: input.outOfRange ?? null,
            recordedBy: context.actor.id,
            deviceId: context.device?.id ?? null,
            recordedAt: input.recordedAt ?? receivedAt,
            receivedAt,
          };
          const [saved] = await tx
            .insert(stepCompletion)
            .values({ id: completionId, ...values })
            .onConflictDoUpdate({
              target: [
                stepCompletion.instanceId,
                stepCompletion.stepId,
                stepCompletion.animalKey,
              ],
              set: values,
            })
            .returning({ id: stepCompletion.id });
          if (input.photo && saved) {
            await tx
              .insert(completionPhoto)
              .values({
                completionId: saved.id,
                farmId: context.farm.id,
                contentType: input.photo.contentType,
                data: input.photo.data,
                createdAt: receivedAt,
              })
              .onConflictDoUpdate({
                target: completionPhoto.completionId,
                set: {
                  contentType: input.photo.contentType,
                  data: input.photo.data,
                  createdAt: receivedAt,
                },
              });
          }
          if (instance.state === "due" || instance.state === "sent_back") {
            await tx
              .update(sopInstance)
              .set({ state: "in_progress" })
              .where(eq(sopInstance.id, input.instanceId));
          }
        }
      );
      return { instanceId: input.instanceId, stepId: input.stepId };
    }),

  /** Finishes the Instance. Refused while any Step — or any animal within a per-animal
   *  Step — is neither done nor skipped. */
  complete: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "sop_instance",
          entityId: input.id,
          action: "update",
          before: { state: "in_progress" },
          after: { state: "completed" },
        },
        async (tx) => {
          const instance = await tx.query.sopInstance.findFirst({
            where: { id: input.id, farmId: context.farm.id },
            with: {
              version: { columns: { content: true } },
              completions: true,
            },
          });
          if (!instance) {
            throw new ORPCError("NOT_FOUND");
          }
          if (
            instance.state !== "in_progress" &&
            instance.state !== "sent_back"
          ) {
            throw new ORPCError("BAD_REQUEST", {
              message: `This work is ${instance.state}, not in progress`,
            });
          }
          assertMayWork(context, instance);
          const content = contentOf(instance.version);
          const animals = await animalsForInstance(
            tx,
            context.farm.id,
            instance.penId,
            content
          );
          const outstanding: string[] = [];
          for (const step of content.steps) {
            const done = instance.completions.filter(
              (completion) => completion.stepId === step.id
            );
            if (step.repeatPerAnimal) {
              const covered = new Set(
                done.map((completion) => completion.animalId)
              );
              const missing = animals.filter((beast) => !covered.has(beast.id));
              if (missing.length > 0) {
                outstanding.push(
                  `${step.id}: ${missing.map((beast) => beast.tagNumber).join(", ")}`
                );
              }
            } else if (done.length === 0) {
              outstanding.push(step.id);
            }
          }
          if (outstanding.length > 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Not finished yet — ${outstanding.join("; ")}`,
              data: { outstanding },
            });
          }
          await tx
            .update(sopInstance)
            .set({ state: "completed", completedAt: now })
            .where(eq(sopInstance.id, input.id));
        }
      );
      return { id: input.id, state: "completed" } as const;
    }),
};
