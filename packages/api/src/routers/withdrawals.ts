import { eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { reasonInput } from "../corrections";
import { loadLiveAnimal, requireAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireOnly, requirePersonalSession } from "../roles";

/**
 * Shortening a Withdrawal is the prescriber's call and nobody else's: it is the one act on the
 * farm that lets milk into the tank, or a cow onto a lorry, earlier than the product's own
 * days say. The Manager runs the farm and the Owner owns it; neither may do this.
 */
const VET_ONLY = {
  message:
    "Only the Vet may shorten a withdrawal, from their own account — the days are the prescriber's",
  reason: "vet_only",
} as const;

/** Her Withdrawals as the trail records them either side of a change. */
const readWithdrawals = async (tx: Tx, id: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id },
    columns: {
      milkWithdrawalUntil: true,
      meatWithdrawalUntil: true,
      withdrawalShortenedReason: true,
    },
  });
  return row ?? null;
};

/**
 * What a Withdrawal may be shortened to: nothing at all, or an instant no later than where it
 * already stands. A hold where none stands is not a shortening either — inventing one would be
 * the Vet holding a cow the Drug List says is free, which is the Drug List's business.
 */
const shorterThan = (
  standing: Date | null,
  asked: Date | null | undefined,
  what: string
): Date | null | undefined => {
  if (asked === undefined) {
    return undefined;
  }
  if (asked === null) {
    return null;
  }
  const wouldLengthen = !standing || asked.getTime() > standing.getTime();
  if (wouldLengthen) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A withdrawal can only be shortened, and that would hold her ${what} for longer`,
      data: { refusal: "not_shorter" },
    });
  }
  return asked;
};

export const withdrawalsRouter = {
  /**
   * The Vet shortens or ends a Withdrawal of hers, with a reason the farm keeps.
   *
   * Either kind or both, and only ever shorter: the product's days are the Drug List's
   * business, and an exception that could lengthen a hold could hide one being shortened.
   * `null` ends that Withdrawal outright. It stands until she is given another dose, which
   * sets the dates afresh from the product's own days.
   */
  shorten: protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .use(requirePersonalSession())
    .input(
      z
        .object({
          animalTag: z.string().trim().min(1).max(32),
          /** The new end for her milk, or null to end it. Left out, her milk is untouched. */
          milkUntil: z.coerce.date().nullish(),
          meatUntil: z.coerce.date().nullish(),
          reason: reasonInput,
        })
        .refine(
          (given) =>
            given.milkUntil !== undefined || given.meatUntil !== undefined,
          { message: "Say which withdrawal is being shortened" }
        )
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.animalTag.toUpperCase();
      // Read outside the transaction only to name her in the trail; the withdrawal that is
      // shortened is the one read inside it.
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        tagNumber
      );
      return await audited(context).write(
        {
          entity: "animal",
          entityId: target.id,
          action: "update",
          reason: input.reason,
          before: (tx) => readWithdrawals(tx, target.id),
          after: (tx) => readWithdrawals(tx, target.id),
        },
        async (tx) => {
          const her = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          const milkUntil = shorterThan(
            her.milkWithdrawalUntil,
            input.milkUntil,
            "milk"
          );
          const meatUntil = shorterThan(
            her.meatWithdrawalUntil,
            input.meatUntil,
            "meat"
          );
          await tx
            .update(animal)
            .set({
              ...(milkUntil === undefined
                ? {}
                : { milkWithdrawalUntil: milkUntil }),
              ...(meatUntil === undefined
                ? {}
                : { meatWithdrawalUntil: meatUntil }),
              withdrawalShortenedAt: now,
              withdrawalShortenedBy: context.actor.id,
              withdrawalShortenedReason: input.reason,
            })
            .where(eq(animal.id, her.id));
          // What is now in force. `undefined` left that hold alone; `null` ended it, and
          // reporting the old date back would be the farm saying it had done nothing.
          return {
            milkUntil:
              milkUntil === undefined ? her.milkWithdrawalUntil : milkUntil,
            meatUntil:
              meatUntil === undefined ? her.meatWithdrawalUntil : meatUntil,
          };
        }
      );
    }),
};
