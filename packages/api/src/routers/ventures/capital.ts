import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import { ventureMovement } from "@OpenFarm/db/schema/venture";
import { capitalItMayHold, roundMoney, takesCapital } from "@OpenFarm/domain";
// The Venture router's part for capital in, and the Buying Floats drawn and counted home.
import { currencyWords } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../../audit";
import { farmDay } from "../../farm-clock";
import { protectedProcedure } from "../../index";
import { theOwnersOf } from "../../intake-store";
import { paperOnFile } from "../../investor-store";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../../roles";
import { paidFromTheFloat } from "../../trip-store";
import { actOnVenture, assertNotSettledUp, ours } from "../../venture-act";
import {
  assertCattleBudgetHolds,
  lockTheFarm,
  readMovement,
  takenAgainst,
  whatTheFloatBought,
} from "../../venture-store";
import type { Context } from "./shared";
import { assertByBank, money } from "./shared";

const capitalInput = z.object({
  agreementId: z.string(),
  amountMoney: money.refine((amount) => amount > 0, {
    message: "Capital in is money arriving",
  }),
  /** The day the bank moved it, on the farm's own clock. */
  movedOn: farmDay,
  /** The farm's own word for how money moved. The door takes all three so it can refuse two of them in
   *  the reader's own language: a schema that only knew "bank" would answer cash with a type error. */
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** The transfer, cheque or deposit slip, and what it is numbered. */
  reference: z.string().trim().min(1).max(120),
});

/** Open, any Venture; paid by the month, its Monthly Sums too while it buys and fattens. Once it sells, a sum not yet
 *  paid is not paid, and the man shares by what he did pay (the advisers' answers, 2026-10-02). */
const assertTakesCapital = (
  row: Parameters<typeof takesCapital>[0] & { capitalPaid: string }
) => {
  if (!takesCapital(row)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        row.capitalPaid === "by_the_month"
          ? "A Venture paid by the month takes its Monthly Sums only until it starts selling"
          : "A Venture takes capital only while it is open",
      data: { refusal: "venture_wrong_state" },
    });
  }
};

/** This Farm's Investment Agreement, or nothing the caller may move money against. */
const theAgreement = async (context: Context, id: string) => {
  const row = await context.db.query.investmentAgreement.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true, ventureId: true, units: true, stampKind: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
  }
  return row;
};

export const capitalProcedures = {
  /**
   * The Investors' capital as it lands: which paper it came against, how much, the day the bank moved
   * it and the reference on the instrument.
   *
   * Never a Money Event. This is the Venture's money passing through an account in the Owner's name,
   * and the Farm's books would be lying if they counted it as income.
   */
  takeCapital: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(capitalInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.paymentMethod !== "bank") {
        // A Venture Account takes bank transfers, cheques and deposit slips. Cash nobody can prove is
        // exactly what an Investor's family would ask about years later.
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes capital by bank only",
          data: { refusal: "capital_must_be_by_bank" },
        });
      }
      const agreement = await theAgreement(context, input.agreementId);
      const row = await ours(context, agreement.ventureId);
      assertTakesCapital(row);
      // Its Units' whole price — or, for a Venture paid by the month, its Units' Cattle Part while it gathers its capital.
      const owed = capitalItMayHold(agreement.units, row);
      const cattlePartOnly = owed < agreement.units * row.unitPriceMoney;
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        async (tx) => {
          // Counted inside the write's own transaction and behind a lock on the Farm row, as signing
          // counts its Units: what an Agreement has taken is only true until the next payment commits,
          // and two arriving together each read a figure that still leaves room for the other. Capital
          // divides by Units, so a Unit paid for twice would take twice its share of the profit while
          // holding one share of the Venture.
          await lockTheFarm(tx, context.farm.id);
          // Asked again behind the lock: a Venture cancelled or moved on at the same moment takes nothing.
          const standing = await tx.query.venture.findFirst({
            where: { id: row.id, farmId: context.farm.id },
          });
          if (standing) {
            assertTakesCapital(standing);
          }
          const paidAlready = await takenAgainst(
            tx,
            context.farm.id,
            agreement.id
          );
          if (paidAlready + input.amountMoney > owed) {
            // Paid by the month, the rest comes as Monthly Sums once the buying starts: said as that, not as a paper
            // that is full, because it is not.
            throw new ORPCError("BAD_REQUEST", {
              message: cattlePartOnly
                ? `This Agreement's Cattle Part is for ${owed - paidAlready} more ${currencyWords("en").sum}; the rest comes by the month`
                : `This Agreement is for ${owed - paidAlready} more ${currencyWords("en").sum}`,
              data: {
                refusal: cattlePartOnly
                  ? "capital_over_cattle_part"
                  : "capital_over_units",
              },
            });
          }
          // Asked after the count, which is the order these two were refused in before the count moved
          // inside the lock: a payment that is both unpapered and over its Units hears the same of the
          // two things it heard before.
          const photo = await tx.query.agreementPaper.findFirst({
            where: { agreementId: agreement.id, farmId: context.farm.id },
            columns: { agreementId: true },
          });
          if (!paperOnFile(agreement, photo !== undefined)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "The stamped Agreement is not on file yet",
              data: { refusal: "agreement_has_no_paper" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: agreement.ventureId,
            kind: "capital_in",
            agreementId: agreement.id,
            amountMoney: input.amountMoney,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /**
   * The Buying Float: money drawn from a Venture Account for one Buying Trip, so the Manager goes to the
   * haat with money that is accounted for. By bank, like every movement of a Venture's money.
   *
   * Refused unless the Venture is buying, refused for more than its Cattle Budget is holding — feed
   * money is not spent on one more bull — and refused for a trip that has been given money already,
   * because a trip funded twice is a trip nobody can reconcile.
   */
  drawFloat: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        buyingTripId: z.string(),
        amountMoney: money.refine((amount) => amount > 0, {
          message: "A Float is money going out",
        }),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const row = await ours(context, input.ventureId);
      if (row.state !== "buying") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture draws a Float only while it is buying",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const trip = await context.db.query.buyingTrip.findFirst({
        where: { id: input.buyingTripId, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!trip) {
        throw new ORPCError("NOT_FOUND", { message: "No such outing" });
      }
      // An outing already bringing the Farm's or another Venture's animals home cannot be funded by this one: the
      // reconciliation counts the Animals bought on the trip for the Venture that paid, and money and animals
      // pointing at different purses is a sum nobody could ever make balance — and the lorry would move into this
      // Venture's purse with them.
      const brought = await context.db.query.intake.findMany({
        where: { farmId: context.farm.id, buyingTripId: input.buyingTripId },
        columns: { animalId: true },
      });
      const owners = await theOwnersOf(
        context.db,
        brought.map((one) => one.animalId)
      );
      if (owners.includes(null)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That outing is bringing the Farm's own animals home",
          data: { refusal: "trip_is_the_farms" },
        });
      }
      if (owners.some((owner) => owner !== row.id)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That outing is bringing another Venture's animals home",
          data: { refusal: "trip_is_another_ventures" },
        });
      }
      const id = uuidv7(now);
      await actOnVenture(context, {
        ventureId: row.id,
        // Read again inside the lock: a Venture moved on or called off while this was being filled in
        // would otherwise still hand out money.
        from: ["buying"],
        wrongState: "A Venture draws a Float only while it is buying",
        refusedOnceSettled: true,
        trail: {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        apply: async (tx, standing) => {
          // Counted inside the write, behind the same lock every other Venture count takes: what the
          // Cattle Budget holds is only true until the next Float commits.
          await assertCattleBudgetHolds(
            tx,
            context.farm.id,
            standing,
            input.amountMoney
          );
          const already = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              buyingTripId: input.buyingTripId,
              kind: "float_out",
            },
            columns: { id: true },
          });
          // The Farm's own float counts too: one outing is paid for by one purse.
          const farmsFloat = await tx.query.handover.findFirst({
            where: {
              farmId: context.farm.id,
              buyingTripId: input.buyingTripId,
              float: "out",
            },
            columns: { id: true },
          });
          if (already || farmsFloat) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That outing has been given a Float already",
              data: { refusal: "float_already_drawn" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "float_out",
            buyingTripId: input.buyingTripId,
            amountMoney: input.amountMoney,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          // What the outing had cost when it was written up was booked as the Farm's; this Float paid it.
          await paidFromTheFloat(tx, audited(context).recordEvent, {
            farmId: context.farm.id,
            tripId: input.buyingTripId,
            ventureId: row.id,
          });
        },
      });
      return { id };
    }),

  /**
   * The Float counted when the trip comes home: what went out equals the Animals it bought for this
   * Venture, plus the outing's own costs, plus the cash brought back and deposited.
   *
   * A reconciliation that does not add up is refused, and says by how much and which way — a Float that
   * nearly balances is a Float nobody has actually counted. Once it is counted the outing is closed: no
   * animal and no cost may be added to it afterwards, because the sum it was counted against would stop
   * being true.
   */
  reconcileFloat: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        buyingTripId: z.string(),
        /** What came back and went into the bank. Nothing, when the whole Float was spent. */
        cashBackMoney: money,
        /** The day it was deposited, and the slip's number. Left out when nothing came back. */
        movedOn: farmDay.optional(),
        reference: z.string().trim().max(120).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.cashBackMoney > 0 && !(input.movedOn && input.reference)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Cash coming back needs the day and the deposit slip",
          data: { refusal: "cash_back_needs_a_slip" },
        });
      }
      const id = uuidv7(now);
      let counted = { animalsMoney: 0, tripMoney: 0, animals: 0 };
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          // What the Float was counted against, kept with the act rather than only returned to the
          // screen: an auditor years later asks what the Owner signed, not what she was shown.
          after: async (tx) => ({
            ...(await readMovement(tx, context.farm.id, id)),
            countedAgainst: counted,
          }),
        },
        async (tx) => {
          // Everything inside the write, behind the lock every count of a Venture's money takes: the
          // sum is only true until the next animal or the next cost lands on the outing.
          await lockTheFarm(tx, context.farm.id);
          const float = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              buyingTripId: input.buyingTripId,
              kind: "float_out",
            },
          });
          if (!float) {
            throw new ORPCError("NOT_FOUND", {
              message: "That outing was never given a Float",
            });
          }
          if (float.reconciledAt) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That Float has been reconciled already",
              data: { refusal: "float_already_reconciled" },
            });
          }
          await assertNotSettledUp(tx, context.farm.id, float.ventureId);
          const bought = await whatTheFloatBought(tx, context.farm.id, {
            buyingTripId: input.buyingTripId,
            ventureId: float.ventureId,
          });
          counted = bought;
          const accountedFor = roundMoney(
            bought.animalsMoney + bought.tripMoney + input.cashBackMoney
          );
          const outMoney = roundMoney(float.amountMoney);
          if (accountedFor !== outMoney) {
            const gapMoney = roundMoney(Math.abs(accountedFor - outMoney));
            throw new ORPCError("BAD_REQUEST", {
              message: `That is ${gapMoney} ${
                accountedFor > outMoney ? "more than" : "short of"
              } the Float`,
              data: {
                refusal: accountedFor > outMoney ? "float_over" : "float_short",
                gapMoney,
              },
            });
          }
          // The homecoming is its own movement even when nothing came back, because the record that the
          // Float was counted, and against what, is the point of counting it.
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: float.ventureId,
            kind: "float_back",
            buyingTripId: input.buyingTripId,
            amountMoney: input.cashBackMoney,
            movedOn: input.movedOn ?? float.movedOn,
            reference: input.reference ?? "",
            refundsId: float.id,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          await tx
            .update(ventureMovement)
            .set({ reconciledAt: now, reconciledBy: context.actor.id })
            .where(eq(ventureMovement.id, float.id));
        }
      );
      return { ...counted, cashBackMoney: input.cashBackMoney };
    }),

  /**
   * What a Buying Trip was given, and from which Venture. The Manager's as well as the Owner's: she is
   * the one taking it to the haat, and she may see what is in her hand without being able to draw it.
   */
  floatOf: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ buyingTripId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.ventureMovement.findFirst({
        where: {
          farmId: context.farm.id,
          buyingTripId: input.buyingTripId,
          kind: "float_out",
        },
        with: { venture: { columns: { name: true } } },
      });
      return row
        ? {
            id: row.id,
            ventureId: row.ventureId,
            ventureName: row.venture?.name ?? "",
            amountMoney: row.amountMoney,
            movedOn: row.movedOn,
            reference: row.reference,
          }
        : null;
    }),
};
