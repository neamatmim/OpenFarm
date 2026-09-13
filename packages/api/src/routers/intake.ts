import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { intake } from "@OpenFarm/db/schema/fattening";
import { SEXES } from "@OpenFarm/db/schema/herd";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { farmDayOf, mayCorrect, nextEidWindow } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { insertAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import {
  correctedPaymentMethodInput,
  paymentMethodInput,
} from "../money-inputs";
import type { Booking } from "../money-store";
import { bookMoney, bookingOf, moneySnapshotOf } from "../money-store";
import { requireOnly, requireRole } from "../roles";

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
  return row
    ? {
        ...row,
        money: row.intake
          ? await moneySnapshotOf(tx, "intake", row.intake.id)
          : null,
      }
    : null;
};

/** The seller as an Intake names them. */
const sellerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
});

const MANAGER_ONLY = {
  message:
    "Taking an animal in is the Manager's to record; the Owner approves what it cost",
  reason: "manager_only",
} as const;

/**
 * Books what the farm paid for an animal as the Intake now says it. A bull given to the farm costs
 * nothing and books nothing — unless he was booked at a price before, which a Correction then puts right.
 */
const bookIntakeMoney = async (
  tx: Tx,
  booking: Booking,
  intakeId: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.intake.findFirst({ where: { id: intakeId } });
  if (!row) {
    return;
  }
  const priceBdt = Number(row.purchasePriceBdt);
  if (priceBdt > 0 || (await moneySnapshotOf(tx, "intake", row.id))) {
    await bookMoney(tx, booking, {
      source: "intake",
      sourceId: row.id,
      amountBdt: priceBdt,
      occurredAt: row.arrivedAt,
      counterpartyId: row.counterpartyId,
      paymentMethod,
    });
  }
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
    seller: sellerInput,
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
    .use(requireOnly("manager", MANAGER_ONLY))
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
    .use(requireOnly("manager", MANAGER_ONLY))
    .input(
      z.object({
        intakeId: z.string(),
        purchasePriceBdt: price.optional(),
        seller: sellerInput.optional(),
        paymentMethod: correctedPaymentMethodInput,
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.intake.findFirst({
        where: { id: input.intakeId, farmId: context.farm.id },
        columns: {
          id: true,
          animalId: true,
          recordedBy: true,
          createdAt: true,
        },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such intake" });
      }
      const verdict = mayCorrect({
        roles: context.roles,
        isOwnEntry: existing.recordedBy === context.actor.id,
        recordedAt: existing.createdAt,
        now,
        windows: correctionWindows(context.farm),
      });
      if (!verdict.allowed) {
        throw new ORPCError("FORBIDDEN", {
          message: "The correction window for that entry has closed",
          data: { refusal: refusalData(verdict.refusal) },
        });
      }
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "animal",
        existing.animalId
      );
      await audit.write(
        {
          entity: "animal",
          entityId: existing.animalId,
          action: "correct",
          reason: input.reason,
          roleUsed: verdict.role,
          supersedesId: previous?.id,
          before: (tx) => readArrival(tx, existing.animalId),
          after: (tx) => readArrival(tx, existing.animalId),
        },
        async (tx) => {
          await tx
            .update(intake)
            .set({
              ...(input.purchasePriceBdt === undefined
                ? {}
                : { purchasePriceBdt: input.purchasePriceBdt.toFixed(2) }),
              ...(input.seller === undefined
                ? {}
                : {
                    counterpartyId: await counterpartyNamed(
                      tx,
                      context.farm.id,
                      input.seller,
                      now
                    ),
                  }),
            })
            .where(eq(intake.id, existing.id));
          await bookIntakeMoney(
            tx,
            bookingOf(context, verdict.role, now),
            existing.id,
            input.paymentMethod
          );
        }
      );
      return { intakeId: existing.id };
    }),
};
