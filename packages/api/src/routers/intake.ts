import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { intake } from "@OpenFarm/db/schema/fattening";
import { SEXES } from "@OpenFarm/db/schema/herd";
import { farmDayOf, nextEidWindow } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { correct } from "../corrections/correction";
import { intakeCorrection, intakeCorrectionInput } from "../corrections/intake";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { insertAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import {
  assertTripIsOurs,
  bookIntakeMoney,
  hasilInput,
  purchasePriceInput,
  readIntake,
  sellerInput,
} from "../intake-store";
import { paymentMethodInput } from "../money-inputs";
import { bookingOf } from "../money-store";
import { requireRole } from "../roles";

/** Enough that the Manager recognises the man; not so many that a shed phone fetches a ledger. */
const SELLERS_SHOWN = 100;

/** Kilogrammes, to the hundred grammes: what a crush scale reads. */
const weight = z.number().positive().max(2000);

const recordInput = z
  .object({
    penId: z.string(),
    sex: z.enum(SEXES),
    /** Who the farm bought it from. A name is enough; the rest is what anyone remembers. */
    seller: sellerInput,
    purchasePriceBdt: purchasePriceInput,
    /** The toll the haat took on her, as its slip gives it. None at a farm-gate sale. */
    hasilBdt: hasilInput.optional(),
    /** The outing she came home on, when the farm wrote one. */
    buyingTripId: z.string().optional(),
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
   * The Manager's or the Owner's: the Owner may do anything the Manager does (the Owner,
   * 2026-09-17), and money the Owner books needs no approval of theirs.
   *
   * The animal and the record of how it arrived are written in one transaction: an animal with
   * no account of where it came from is the thing a half-finished arrival would leave behind.
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
      const intakeId = newId(now);
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
          await assertTripIsOurs(tx, context.farm.id, input.buyingTripId);
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
            hasilBdt: (input.hasilBdt ?? 0).toFixed(2),
            buyingTripId: input.buyingTripId ?? null,
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
          await bookIntakeMoney(
            tx,
            bookingOf(context, context.roleUsed, now),
            intakeId,
            input.paymentMethod
          );
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

  /**
   * Puts right what an Intake says the farm paid, who sold the animal, or how he was paid — and with it
   * the Money Event, rather than a second one. A Correction like any other: a reason, the Role's
   * Correction Window, and the trail holding what it said before.
   *
   * The Manager's, as recording is (roles matrix: Intake / Sale — Manager C R U, Owner R).
   */
  correct: protectedProcedure
    .use(requireRole(...intakeCorrection.roles))
    .input(intakeCorrectionInput)
    .handler(({ context, input }) => correct(context, intakeCorrection, input)),
};
