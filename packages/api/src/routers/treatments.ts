import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  doseNotPrescribedCorrection,
  doseNotPrescribedCorrectionInput,
} from "../corrections/dose-not-prescribed";
import { recordDoseNotPrescribed } from "../dose-not-prescribed-store";
import { protectedProcedure } from "../index";
import { takeBackTheExcuse, excuseArrivalDose } from "../put-off-store";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";

/** Whether a dose is needed is the Vet's to say. */
const EXCUSED_BY_THE_VET = {
  message: "Only the Vet may say a dose is not needed",
  reason: "vet_only",
} as const;

export const treatmentsRouter = {
  /**
   * A dose given without a Prescription — the pharmacy's advice, or anybody's — written by the Owner or the Manager once
   * it was given. It holds her milk and her meat as any dose does: for the product's own days, or else the Vet's Default
   * Withdrawal Days. The Vet is told of it at once, by the sweep.
   */
  giveNotPrescribed: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        animalTag: z.string().trim().min(1).max(32),
        productId: z.string(),
        /** When it was given; left out, now. */
        givenAt: z.coerce.date().optional(),
        /** Who advised it and why: "জ্বর, ফার্মেসির পরামর্শে". */
        advice: z.string().trim().min(1).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let id = "";
      const done = await audited(context).write(
        {
          entity: "treatment",
          entityId: () => id,
          action: "create",
          after: async (tx) =>
            (await tx.query.treatment.findFirst({ where: { id } })) ?? null,
        },
        async (tx) => {
          const made = await recordDoseNotPrescribed(
            tx,
            context.farm.id,
            {
              tagNumber: input.animalTag.toUpperCase(),
              productId: input.productId,
              givenAt: input.givenAt ?? now,
              advice: input.advice,
              givenBy: context.actor.id,
            },
            now
          );
          ({ id } = made);
          return made;
        }
      );
      return { id: done.id };
    }),

  /** A dose not prescribed voided: the wrong cow, written twice (`doseNotPrescribedCorrection`). */
  correctNotPrescribed: protectedProcedure
    .use(requireRole(...doseNotPrescribedCorrection.roles))
    .use(requirePersonalSession())
    .input(doseNotPrescribedCorrectionInput)
    .handler(async ({ context, input }) => {
      await correct(context, doseNotPrescribedCorrection, input);
      return { id: input.id };
    }),

  /**
   * The Vet's written reason one of a bull's arrival doses is not needed — the card from the farm he came from, say. It
   * is no longer owed, what was raised again for it is called off, and his Release may go ahead. The Vet's alone, from
   * their own account; kept, never removed.
   */
  excuseArrivalDose: protectedProcedure
    .use(requireOnly("vet", EXCUSED_BY_THE_VET))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(32),
        definitionId: z.string(),
        reason: z.string().trim().min(3).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const him = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: { id: true },
      });
      if (!him) {
        throw new ORPCError("NOT_FOUND", { message: "No such animal" });
      }
      const readExcuse = async (tx: Pick<Tx, "query">) =>
        (await tx.query.excusedDose.findFirst({
          where: { animalId: him.id, definitionId: input.definitionId },
        })) ?? null;
      await audited(context).write(
        {
          entity: "excused_dose",
          entityId: `${him.id}:${input.definitionId}`,
          action: "create",
          reason: input.reason,
          after: readExcuse,
        },
        (tx) =>
          excuseArrivalDose(tx, {
            farmId: context.farm.id,
            animalId: him.id,
            definitionId: input.definitionId,
            reason: input.reason,
            vetId: context.actor.id,
            now,
            trail: audited(context).recordEvent,
          })
      );
      return { tagNumber: input.tagNumber.toUpperCase() };
    }),

  /** The Vet's excuse for an arrival dose taken back, with a reason (`takeBackTheExcuse`). The Vet's alone. */
  takeBackExcuse: protectedProcedure
    .use(requireOnly("vet", EXCUSED_BY_THE_VET))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(32),
        definitionId: z.string(),
        reason: z.string().trim().min(3).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const him = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: { id: true },
      });
      if (!him) {
        throw new ORPCError("NOT_FOUND", { message: "No such animal" });
      }
      await audited(context).write(
        {
          entity: "excused_dose",
          entityId: `${him.id}:${input.definitionId}`,
          action: "correct",
          reason: input.reason,
          after: () => Promise.resolve(null),
        },
        (tx) =>
          takeBackTheExcuse(tx, {
            farmId: context.farm.id,
            animalId: him.id,
            definitionId: input.definitionId,
            now,
          })
      );
      return { tagNumber: input.tagNumber.toUpperCase() };
    }),
};
