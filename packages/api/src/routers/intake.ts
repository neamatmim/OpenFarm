import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { intake } from "@OpenFarm/db/schema/fattening";
import { SEXES } from "@OpenFarm/db/schema/herd";
import { farmDayOf, nextEidWindow } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { insertAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { bookMoney, bookingOf } from "../money-store";
import { requireOnly, requireRole } from "../roles";
import { paymentMethodInput } from "./money";

/** The arrival as the trail records it: the Animal it made and what the farm paid for it. */
const readArrival = async (tx: Tx, animalId: string) => {
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

/** Enough that the Manager recognises the man; not so many that a shed phone fetches a ledger. */
const SELLERS_SHOWN = 100;

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
      address: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(20).optional(),
    }),
    purchasePriceBdt: price,
    weightKg: weight,
    /** Months, as the seller says and the Manager judges. Asked for, not optional: a bull with
     *  no age is a bull whose gain nobody can read. */
    estimatedAgeMonths: z.number().int().min(0).max(360),
    breed: z.string().trim().max(60).optional(),
    officialTag: z.string().trim().max(60).optional(),
    /** What it is being fed towards, when the Manager has a figure of her own for this one. */
    targetWeightKg: weight.optional(),
    /** When the farm means to sell it. Both days or neither: half a window is not a window. */
    targetWindowStart: farmDay.optional(),
    targetWindowEnd: farmDay.optional(),
    /** When it came off the lorry, for an arrival written up the next morning. */
    arrivedAt: z.coerce.date().optional(),
    /** How the seller was paid. */
    paymentMethod: paymentMethodInput,
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

export const intakeRouter = {
  /**
   * The traders the farm deals with, most recent first.
   *
   * Read by the Owner as well as the Manager: the roles matrix gives the Owner `R` on Intake,
   * and who the farm buys from is exactly the sort of thing an Owner reads without doing.
   */
  sellers: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      context.db.query.counterparty.findMany({
        where: { farmId: context.farm.id },
        orderBy: { createdAt: "desc" },
        columns: { id: true, name: true, address: true, phone: true },
        limit: SELLERS_SHOWN,
      })
    ),

  /**
   * Takes a bought-in animal in on the Fattening side.
   *
   * The Manager's alone (roles matrix: Intake / Sale is `C R U` to the Manager and `R; approve
   * above threshold` to the Owner). The Owner answers for the money, not for the buying — so an
   * Owner sent here is told why rather than left looking for a permission to change. An Owner
   * who does the buying on a small farm holds the Manager role too, and acts under it.
   *
   * The animal and the record of how it arrived are written in one transaction: an animal with
   * no account of where it came from is the thing a half-finished arrival would leave behind.
   */
  record: protectedProcedure
    .use(
      requireOnly("manager", {
        message:
          "Taking an animal in is the Manager's to record; the Owner approves what it cost",
        reason: "manager_only",
      })
    )
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
      const intakeId = newId(now);
      let tagNumber = "";
      await audited(context).write(
        {
          entity: "animal",
          entityId: id,
          action: "create",
          after: (tx) => readArrival(tx, id),
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
          const sellerId = await counterpartyNamed(
            tx,
            context.farm.id,
            input.seller,
            now
          );
          await tx.insert(intake).values({
            id: intakeId,
            farmId: context.farm.id,
            animalId: id,
            counterpartyId: sellerId,
            purchasePriceBdt: input.purchasePriceBdt.toFixed(2),
            weightKg: input.weightKg.toFixed(2),
            estimatedAgeMonths: input.estimatedAgeMonths,
            targetWindowStart: window.start,
            targetWindowEnd: window.end,
            targetWeightKg: (
              input.targetWeightKg ?? context.farm.fatteningTargetWeightKg
            ).toFixed(2),
            arrivedAt,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          // A bull given to the farm costs nothing, and nothing is booked for him.
          if (input.purchasePriceBdt > 0) {
            await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
              source: "intake",
              sourceId: intakeId,
              amountBdt: input.purchasePriceBdt,
              occurredAt: arrivedAt,
              counterpartyId: sellerId,
              paymentMethod: input.paymentMethod,
            });
          }
        }
      );
      return {
        id,
        intakeId,
        tagNumber,
        state: "quarantine" as const,
        targetWindow: window,
      };
    }),
};
