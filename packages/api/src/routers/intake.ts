import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { counterparty, intake } from "@OpenFarm/db/schema/fattening";
import { SEXES } from "@OpenFarm/db/schema/herd";
import { nextEidWindow } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { farmDay, farmDayOf } from "../farm-clock";
import { insertAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** The arrival as the trail records it: the Animal it made and what the farm paid for it. */
const readIntake = async (tx: Tx, animalId: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: {
      tagNumber: true,
      sex: true,
      side: true,
      state: true,
      penId: true,
    },
    with: { intake: true },
  });
  return row ?? null;
};

/** Kilogrammes, to the hundred grammes: what a crush scale reads. */
const weight = z.number().positive().max(2000);
/** Taka. Whole animals are bought in thousands; the column keeps poisha so finance can too. */
const price = z.number().min(0).max(100_000_000);

const recordInput = z
  .object({
    penId: z.string(),
    sex: z.enum(SEXES),
    /** Who the farm bought it from. A name is enough; the rest is what anyone remembers. */
    seller: z.object({
      name: z.string().trim().min(1).max(120),
      place: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(20).optional(),
    }),
    purchasePriceBdt: price,
    weightKg: weight,
    estimatedAgeMonths: z.number().int().min(0).max(360).optional(),
    breed: z.string().trim().max(60).optional(),
    officialTag: z.string().trim().max(60).optional(),
    /** What it is being fed towards, when the Manager has a figure of her own for this one. */
    targetWeightKg: weight.optional(),
    /** When the farm means to sell it. Both days or neither: half a window is not a window. */
    targetWindowStart: farmDay.optional(),
    targetWindowEnd: farmDay.optional(),
    /** When it came off the lorry, for an arrival written up the next morning. */
    arrivedAt: z.coerce.date().optional(),
  })
  .refine(
    (value) =>
      (value.targetWindowStart === undefined) ===
      (value.targetWindowEnd === undefined),
    { message: "A Target Window needs both its days" }
  )
  .refine(
    (value) =>
      value.targetWindowStart === undefined ||
      value.targetWindowEnd === undefined ||
      value.targetWindowStart <= value.targetWindowEnd,
    { message: "A Target Window cannot end before it begins" }
  );

/**
 * The trader, recorded once per Farm.
 *
 * Found by name rather than chosen from a list, because that is how the Manager knows him: a
 * farm does not carry a customer database, it carries the names of the people it deals with.
 */
const theSeller = async (
  tx: Tx,
  farmId: string,
  seller: { name: string; place?: string; phone?: string },
  now: Date
): Promise<string> => {
  const known = await tx.query.counterparty.findFirst({
    where: { farmId, name: seller.name },
    columns: { id: true },
  });
  if (known) {
    return known.id;
  }
  const id = newId(now);
  await tx.insert(counterparty).values({
    id,
    farmId,
    name: seller.name,
    place: seller.place ?? null,
    phone: seller.phone ?? null,
    createdAt: now,
  });
  return id;
};

export const intakeRouter = {
  /**
   * Takes a bought-in animal in on the Fattening side.
   *
   * The Manager's act and the Owner's: it is a purchase, and buying an animal is not something
   * a milker or a Vet does. The animal and the record of how it arrived are written in one
   * transaction — an animal with no account of where it came from is the thing a half-finished
   * arrival would leave behind.
   */
  record: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(recordInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const arrivedAt = input.arrivedAt ?? now;
      if (arrivedAt.getTime() > now.getTime()) {
        throw new ORPCError("BAD_REQUEST", {
          message: "An animal cannot have arrived tomorrow",
        });
      }
      // The next Eid-ul-Adha, which is what a fattening animal is bought for unless the Manager
      // is selling into some other market.
      const window =
        input.targetWindowStart && input.targetWindowEnd
          ? { start: input.targetWindowStart, end: input.targetWindowEnd }
          : nextEidWindow(farmDayOf(now));
      if (!window) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The farm has no Eid date that far ahead; name the Target Window yourself",
        });
      }
      const id = newId(now);
      let tagNumber = "";
      await audited(context).write(
        {
          entity: "animal",
          entityId: id,
          action: "create",
          after: (tx) => readIntake(tx, id),
        },
        async (tx) => {
          const made = await insertAnimal(tx, {
            id,
            farmId: context.farm.id,
            actorId: context.actor.id,
            input: {
              sex: input.sex,
              side: "fattening",
              state: "quarantine",
              penId: input.penId,
              source: "bought",
              breed: input.breed,
              officialTag: input.officialTag,
            },
            now,
            reason: "intake",
          });
          ({ tagNumber } = made);
          await tx.insert(intake).values({
            id: newId(now),
            farmId: context.farm.id,
            animalId: id,
            counterpartyId: await theSeller(
              tx,
              context.farm.id,
              input.seller,
              now
            ),
            purchasePriceBdt: input.purchasePriceBdt.toFixed(2),
            weightKg: input.weightKg.toFixed(2),
            estimatedAgeMonths: input.estimatedAgeMonths ?? null,
            targetWindowStart: window.start,
            targetWindowEnd: window.end,
            targetWeightKg: (
              input.targetWeightKg ?? context.farm.fatteningTargetWeightKg
            ).toFixed(2),
            arrivedAt,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id, tagNumber, state: "quarantine" as const, ...window };
    }),
};
