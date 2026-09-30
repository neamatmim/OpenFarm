import { z } from "zod";

import { audited } from "../audit";
import { recordDoseNotPrescribed } from "../dose-not-prescribed-store";
import { protectedProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";

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
};
