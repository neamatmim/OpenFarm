import { uuidv7 } from "@OpenFarm/db/ids";
import { ROUTES, prescription, treatment } from "@OpenFarm/db/schema/health";
import type { SopContent } from "@OpenFarm/domain";
import {
  MAX_COURSE_DAYS,
  MAX_TIMES_A_DAY,
  mayBePrescribed,
  whyNotPrescribable,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import {
  prescriptionView,
  doseTimesFor,
  thePrescription,
} from "../health-store";
import { loadLiveAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { raiseDueInstances } from "../instances-store";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";
import { contentOf, publishedContent } from "../sop-content";
import { assertOnTheirCases } from "../visiting-store";

/** A Prescription is the Vet's act in law, like the Diagnosis it answers (BVC Act 2019). */
const VET_ONLY = {
  message:
    "Only the Vet writes a Prescription, from their own account — it is their act, not the farm's",
  reason: "vet_only",
} as const;

const TIME_PATTERN = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u;

/**
 * The SOP the farm treats with: the one whose Version says a Prescription raises it. An SOP
 * declares what raises it, so the farm needs no second place recording which procedure this
 * is — and the Owner can reword the dose Step, add a glove or a withdrawal reminder to it,
 * and it stays the same procedure.
 */
const theTreatmentSop = async (tx: Tx, farmId: string) => {
  const definitions = await tx.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    orderBy: { createdAt: "asc" },
    with: { currentVersion: true },
  });
  // A Definition with nothing published yet says nothing about what raises it, and asking it
  // would be asking an empty column what its triggers are.
  const treating = definitions.find((definition) =>
    publishedContent(definition)?.triggers.some(
      (trigger) => trigger.kind === "prescription"
    )
  );
  if (!treating?.currentVersion) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "The farm has no published treatment procedure for a prescription to raise; the Owner publishes one whose trigger is a prescription",
      data: { refusal: "no_treatment_sop" },
    });
  }
  // More than one is a Playbook the Owner can put right; the oldest is used meanwhile, so
  // which one a course lands on never depends on the order a query came back in.
  return {
    definitionId: treating.id,
    versionId: treating.currentVersion.id,
    content: contentOf(treating.currentVersion),
  };
};

/**
 * One Instance per dose, and one Treatment against each saying what is owed. The Instances
 * are kept apart by a cause naming the course and the dose, so nothing can raise the same
 * dose twice however often anything runs.
 */
const raiseCourse = async (
  tx: Tx,
  {
    farmId,
    prescriptionId,
    productId,
    animalId,
    penId,
    doseTimes,
    sop,
    now,
  }: {
    farmId: string;
    prescriptionId: string;
    productId: string;
    animalId: string;
    penId: string;
    doseTimes: Date[];
    sop: { definitionId: string; versionId: string; content: SopContent };
    now: Date;
  }
) => {
  const causeOf = (number: number) =>
    `prescription:${prescriptionId}:${number}`;
  const raised = await raiseDueInstances(
    tx,
    farmId,
    doseTimes.map((dueAt, index) => ({
      definitionId: sop.definitionId,
      versionId: sop.versionId,
      penId,
      animalId,
      dueAt,
      cause: causeOf(index + 1),
      graceMinutes: sop.content.graceMinutes,
      assignedRole: sop.content.assignedRole,
      checkerRole: sop.content.checkerRole,
    })),
    now
  );
  // Matched by cause rather than by position: work already raised is skipped, and a dose
  // hung on the wrong Instance would be a dose given on the wrong day.
  const numberOf = new Map(
    doseTimes.map((dueAt, index) => [
      causeOf(index + 1),
      { number: index + 1, dueAt },
    ])
  );
  const doses = raised.flatMap((instance) => {
    const dose = instance.cause ? numberOf.get(instance.cause) : undefined;
    return dose
      ? [
          {
            id: uuidv7(now),
            farmId,
            prescriptionId,
            productId,
            animalId,
            instanceId: instance.id,
            number: dose.number,
            dueAt: dose.dueAt,
            createdAt: now,
          },
        ]
      : [];
  });
  if (doses.length > 0) {
    await tx.insert(treatment).values(doses);
  }
};

export const prescriptionsRouter = {
  /**
   * The Vet's order for one animal, and the work it raises: one Instance of the Treatment SOP
   * per dose, at the times the Vet set, each with a Treatment saying what is owed.
   *
   * Every dose is raised here and now rather than by something that runs later, so the whole
   * course exists the moment it is written — the Vet can see it, and nothing needs to be
   * running for a dose to arrive on a phone in three days' time.
   */
  prescribe: protectedProcedure
    .use(requireOnly("vet", VET_ONLY, { visitingVet: true }))
    .use(requirePersonalSession())
    .input(
      z.object({
        animalTag: z.string().trim().min(1).max(32),
        /** What it treats. A course is given for something the Vet concluded. */
        diagnosisId: z.string(),
        productId: z.string(),
        dose: z.string().trim().min(1).max(60),
        route: z.enum(ROUTES),
        times: z
          .array(z.string().trim().regex(TIME_PATTERN, "HH:MM"))
          .min(1)
          .max(MAX_TIMES_A_DAY),
        days: z.number().int().min(1).max(MAX_COURSE_DAYS),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      const times = [...new Set(input.times)].toSorted();
      const doseTimes = doseTimesFor(now, times, input.days);
      await audited(context).write(
        {
          entity: "prescription",
          entityId: id,
          action: "create",
          after: {
            productId: input.productId,
            dose: input.dose,
            route: input.route,
            times,
            days: input.days,
            doses: doseTimes.length,
          },
        },
        async (tx) => {
          const her = await loadLiveAnimal(
            tx,
            context.farm.id,
            input.animalTag.toUpperCase()
          );
          assertOnTheirCases(context, her.id);
          const answers = await tx.query.diagnosis.findFirst({
            where: { id: input.diagnosisId, farmId: context.farm.id },
            columns: { animalId: true },
          });
          if (!answers || answers.animalId !== her.id) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That diagnosis is not this animal's",
            });
          }
          const product = await tx.query.drugProduct.findFirst({
            where: { id: input.productId, farmId: context.farm.id },
            columns: {
              milkWithdrawalDays: true,
              meatWithdrawalDays: true,
              retiredAt: true,
            },
          });
          if (!product) {
            throw new ORPCError("NOT_FOUND", { message: "No such product" });
          }
          // A course that starts without known withdrawal days is milk nobody can say is
          // safe, and meat nobody can certify. The reason is the Drug List's own.
          if (!mayBePrescribed(product)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That product may not be prescribed",
              data: { refusal: whyNotPrescribable(product) },
            });
          }
          const sop = await theTreatmentSop(tx, context.farm.id);
          await tx.insert(prescription).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            diagnosisId: input.diagnosisId,
            productId: input.productId,
            dose: input.dose,
            route: input.route,
            times,
            days: input.days,
            prescribedBy: context.actor.id,
            prescribedAt: now,
            recordedAt: now,
          });
          await raiseCourse(tx, {
            farmId: context.farm.id,
            prescriptionId: id,
            productId: input.productId,
            animalId: her.id,
            penId: her.penId,
            doseTimes,
            sop,
            now,
          });
        }
      );
      return { id, doses: doseTimes.length };
    }),

  /** Every course this animal has been on, newest first, with each dose and its work. The
   *  Vet writes them; the Owner and the Manager read them (roles matrix). */
  forAnimal: protectedProcedure
    .use(requireRole("owner", "manager", "vet", { visitingVet: true }))
    .input(z.object({ tagNumber: z.string().trim().min(1).max(32) }))
    .handler(async ({ context, input }) => {
      const her = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: { id: true },
      });
      if (!her) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      assertOnTheirCases(context, her.id);
      const rows = await context.db.query.prescription.findMany({
        where: { farmId: context.farm.id, animalId: her.id },
        orderBy: { prescribedAt: "desc" },
        with: thePrescription,
      });
      return rows.map(prescriptionView);
    }),
};
