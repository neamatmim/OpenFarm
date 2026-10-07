// The Venture router's part for the Settlement, its payouts and its adjustments.

import { and, eq } from "@OpenFarm/db/operators";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import {
  ventureSettlementShare,
  ventureSettlement,
} from "@OpenFarm/db/schema/venture-account";
import type { PaymentMethod } from "@OpenFarm/domain";
import {
  farmDayOf,
  farmsOwnPayout,
  roundMoney,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../../audit";
import { audited } from "../../audit";
import { counterpartyNamed } from "../../counterparty-store";
import { farmsOwnOf } from "../../farm-capital-store";
import { farmDay } from "../../farm-clock";
import { protectedProcedure } from "../../index";
import { farmAccountIdInput } from "../../money-inputs";
import {
  accountSaid,
  bookMoney,
  bookingOf,
  forgetTheMoneyOf,
} from "../../money-store";
import { requirePasswordGiven } from "../../password-again";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../../roles";
import {
  adjustmentAgainst,
  adjustmentsOf,
  whatAnAdjustmentSends,
  closeAdjustment,
  raiseAdjustment,
  theAdjustment,
  reopenAdjustment,
} from "../../settlement-adjustment-store";
import {
  approvedSettlementOf,
  approveSettlement,
  payOut,
  reachesSettledOnLastPayout,
  readSettlement,
  settlementOf,
} from "../../settlement-store";
import { ours } from "../../venture-act";
import { lockTheFarm, readVenture } from "../../venture-store";
import type { Context } from "./shared";
import { assertByBank } from "./shared";

/** How the return part of the Farm's own payout marks the transfer's reference it shares with the capital back. */
const RETURN_PART = " · return";

/**
 * One transfer's reference on each of the Money Events it is booked as, which a Farm Account takes once each: the
 * reference as written for a transfer of one part, and marked with its place — "ADJ-1 · 2/3" — for one of several.
 */
const referenceOfPart = (
  reference: string | undefined,
  part: number,
  parts: number
) =>
  reference === undefined || parts === 1
    ? reference
    : `${reference} · ${part + 1}/${parts}`;

/** What one payment out of an approved Settlement is: how much, and what it marks off when it lands. */
interface GoingOut {
  amountMoney: number;
  mark: (tx: Tx, movementId: string) => Promise<unknown>;
  /** The Farm's own Units' payout: the capital it put in, for its books to read the payout as capital back and return. */
  farmsOwn?: { capitalMoney: number };
}

/**
 * One payment against an approved Settlement, whichever of the four it is: three going out, and the Farm's
 * share of a loss coming in.
 *
 * An Investor's share, the Owner's own money back and the Farm's share of the profit are the same act
 * with a different name on the cheque: the same lock, the same refusal when nothing has been approved,
 * the same movement of the Venture's money, and the same look afterwards at whether anything is left to
 * pay. What differs is who is owed and what it marks off, which is all `owed` decides.
 */
const moveSettlementMoney = async (
  // Narrower than `Context` on two counts, because the Farm's share is booked onto the Farm's own
  // books and a booking needs both: somebody did this, and it was done in a Role.
  context: Context & {
    actor: { id: string };
    roleUsed: NonNullable<Context["roleUsed"]>;
  },
  input: {
    ventureId: string;
    movedOn: string;
    paymentMethod: PaymentMethod;
    reference: string;
    /** The Farm Account the Farm's own side of it went into or came out of: its share, or its share of a loss. */
    farmAccountId?: string;
  },
  kind: "payout" | "advance_repaid" | "farm_share" | "farm_loss_in",
  owed: (
    approved: NonNullable<Awaited<ReturnType<typeof approvedSettlementOf>>>
  ) => GoingOut
) => {
  const now = context.clock.now();
  const row = await ours(context, input.ventureId);
  assertByBank(input.paymentMethod);
  return await audited(context).write(
    {
      entity: "venture_settlement",
      entityId: row.id,
      action: "update",
      before: (tx) => readSettlement(tx, context.farm.id, row.id),
      after: (tx) => readSettlement(tx, context.farm.id, row.id),
    },
    async (tx) => {
      await lockTheFarm(tx, context.farm.id);
      const approved = await approvedSettlementOf(tx, context.farm.id, row.id);
      if (!approved) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Nothing is owed until the Settlement is approved",
          data: { refusal: "not_yet_approved" },
        });
      }
      const going = owed(approved);
      const movementId = await payOut(
        tx,
        context.farm.id,
        {
          ventureId: row.id,
          kind,
          amountMoney: going.amountMoney,
          movedOn: input.movedOn,
          reference: input.reference,
        },
        { actorId: context.actor.id, now }
      );
      await going.mark(tx, movementId);
      // The Farm's own Units paid out: its capital home to its own books, and its share of the profit on that capital as
      // its income — two Money Events, so the payout is never read whole as the Farm's earnings.
      if (going.farmsOwn) {
        const { capitalBackMoney, returnMoney } = farmsOwnPayout({
          capitalMoney: going.farmsOwn.capitalMoney,
          payoutMoney: going.amountMoney,
        });
        // One transfer, two parts: a Farm Account takes a reference once, so the return carries the transfer's reference
        // marked as its part. The account's month still adds up to the bank's, which is what its Bank Check reads.
        for (const [source, amountMoney, reference] of [
          ["venture_capital_back", capitalBackMoney, input.reference],
          [
            "venture_capital_return",
            returnMoney,
            `${input.reference}${RETURN_PART}`,
          ],
        ] as const) {
          if (amountMoney > 0) {
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one statement at a time
            await bookMoney(
              tx,
              bookingOf(
                context,
                context.roleUsed,
                now,
                accountSaid([source], { ...input, reference })
              ),
              {
                source,
                sourceId: movementId,
                amountMoney,
                occurredAt: startOfFarmDay(input.movedOn),
                counterpartyId: null,
                paymentMethod: input.paymentMethod,
              }
            );
          }
        }
      }
      // The Farm's share is the one part of a Settlement that is the Farm's own earnings, so it lands
      // on the Farm's books as income. An Investor's payout and the Owner's Advance coming back are
      // not: that money was never the Farm's, and counting it would read a run's whole proceeds as the
      // Farm's own.
      //
      // The Farm's share of a loss is the same money the other way: the Farm's own taka, going in to carry
      // its part of a run that lost, and so on the Farm's books as money out.
      if (kind === "farm_share" || kind === "farm_loss_in") {
        await bookMoney(
          tx,
          bookingOf(
            context,
            context.roleUsed,
            now,
            accountSaid(["farm_share", "farm_loss"], input)
          ),
          {
            source: kind === "farm_share" ? "farm_share" : "farm_loss",
            sourceId: movementId,
            amountMoney: going.amountMoney,
            occurredAt: startOfFarmDay(input.movedOn),
            counterpartyId: null,
            paymentMethod: input.paymentMethod,
          }
        );
      }
      await reachesSettledOnLastPayout(
        tx,
        context.farm.id,
        row.id,
        audited(context).recordEvent,
        (inner) => readVenture(inner, context.farm.id, row.id)
      );
      return { paidMoney: going.amountMoney };
    }
  );
};

export const settlementProcedures = {
  /** A Venture's Settlement: worked out, approved, paid, and put right after. */
  settlement: {
    /**
     * The close-out of a Venture, shown before anything is done: what its Animals fetched, every charge as
     * its own line, the Owner's Advance, capital, the profit and what each Investor is owed.
     *
     * It comes back with whatever makes it a guess rather than refusing outright, because an Owner told
     * only "no" has nothing to go and put right — and because she is owed the shape of the answer while she
     * is chasing the last weigh-in that would finish it.
     */
    get: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(z.object({ ventureId: z.string() }))
      .handler(async ({ context, input }) => {
        const row = await ours(context, input.ventureId);
        return await settlementOf(
          context.db,
          context.farm.id,
          row,
          farmDayOf(context.clock.now())
        );
      }),

    /**
     * The Owner approving the Settlement, as one act, which writes the figures down as they stood.
     *
     * After this they do not move: a late cost or a Correction changes what the costing says and changes
     * nothing here, because what an Investor is shown a year later has to be what he was shown on the day.
     * Refused while anything about it is still a guess, in the same word the view was showing her.
     */
    approve: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .use(requirePasswordGiven())
      .input(
        z.object({
          ventureId: z.string(),
          note: z.string().trim().max(400).optional(),
        })
      )
      .handler(async ({ context, input }) => {
        const now = context.clock.now();
        const row = await ours(context, input.ventureId);
        let settlementId = "";
        await audited(context).write(
          {
            entity: "venture_settlement",
            entityId: input.ventureId,
            action: "create",
            reason: input.note,
            after: (tx) => readSettlement(tx, context.farm.id, row.id),
          },
          async (tx) => {
            await lockTheFarm(tx, context.farm.id);
            // Worked out again inside the lock and behind it: the figures written down must be the figures
            // as they stand at the moment of writing, not as they stood when a screen was drawn.
            const worked = await settlementOf(
              tx,
              context.farm.id,
              row,
              farmDayOf(now)
            );
            settlementId = await approveSettlement(
              tx,
              context.farm.id,
              row.id,
              worked,
              {
                actorId: context.actor.id,
                now,
              }
            );
            // A Venture that owes nobody anything is finished the moment it is approved, and must not be
            // left in Selling for ever waiting for a payment that will never be made.
            await reachesSettledOnLastPayout(
              tx,
              context.farm.id,
              row.id,
              audited(context).recordEvent,
              (inner) => readVenture(inner, context.farm.id, row.id)
            );
          }
        );
        return { id: settlementId };
      }),

    /**
     * What an approved Settlement says, and what has happened about it: each Investor's share, whether it
     * has gone out, and whether he has said he had it.
     */
    approved: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(z.object({ ventureId: z.string() }))
      .handler(async ({ context, input }) => {
        const row = await ours(context, input.ventureId);
        return await readSettlement(context.db, context.farm.id, row.id);
      }),

    /**
     * One Investor paid what the approved Settlement owes him, by bank like every movement of a Venture's
     * money, with the day and the reference it went on — so that "I never got it" has an answer that is
     * not somebody's memory.
     *
     * After the Owner's Advance has gone back, because she put her own money in to feed their animals and
     * it comes back at cost before any capital returns.
     */
    pay: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .use(requirePasswordGiven())
      .input(
        z.object({
          ventureId: z.string(),
          agreementId: z.string(),
          /** What the Owner read before she sent it. Refused when it is not what the paper says she owes:
           *  a figure typed from memory is how a payout goes out wrong. */
          amountMoney: z.number().positive().max(1_000_000_000),
          movedOn: farmDay,
          paymentMethod: z.enum(PAYMENT_METHODS),
          reference: z.string().trim().min(1).max(120),
          /** For the Farm's own Units: the Farm Account its capital comes home to, where it lists its accounts. */
          farmAccountId: z.string().optional(),
        })
      )
      .handler(async ({ context, input }) => {
        // Whether this share is the Farm's own Units, whose payout lands on the Farm's own books.
        const itsOwn = await farmsOwnOf(context.db, context.farm.id, [
          input.agreementId,
        ]);
        return await moveSettlementMoney(
          context,
          input,
          "payout",
          (approved) => {
            if (
              approved.row.advanceRepaidId === null &&
              approved.row.advanceMoney !== 0
            ) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Your own money comes back before any capital does",
                data: { refusal: "advance_comes_first" },
              });
            }
            const his = approved.shares.find(
              (one) => one.agreementId === input.agreementId
            );
            if (!his) {
              throw new ORPCError("NOT_FOUND", {
                message: "This Settlement owes nothing on that Agreement",
              });
            }
            if (his.paidMovementId) {
              throw new ORPCError("BAD_REQUEST", {
                message: "That has already gone out",
                data: { refusal: "already_paid" },
              });
            }
            const owed = his.payoutMoney;
            if (owed <= 0) {
              // The run lost more than he put in, so there is nothing to send him. What he owes back is a
              // conversation, not a movement of the Venture's money.
              throw new ORPCError("BAD_REQUEST", {
                message: "This Settlement owes nothing on that Agreement",
                data: { refusal: "nothing_to_pay_him", owed },
              });
            }
            if (roundMoney(input.amountMoney) !== roundMoney(owed)) {
              throw new ORPCError("BAD_REQUEST", {
                message: `This Settlement owes ${owed} on that Agreement`,
                data: { refusal: "not_what_he_is_owed", owed },
              });
            }
            const farmsOwn = itsOwn.has(input.agreementId);
            return {
              amountMoney: owed,
              mark: (tx: Tx, movementId: string) =>
                tx
                  .update(ventureSettlementShare)
                  .set({
                    paidMovementId: movementId,
                    // The Farm's own payout lands on the Farm's own books as it is sent: nobody is left to say they had it.
                    ...(farmsOwn
                      ? {
                          acknowledgedAt: context.clock.now(),
                          acknowledgedBy: context.actor.id,
                        }
                      : {}),
                  })
                  .where(
                    and(
                      eq(ventureSettlementShare.id, his.id),
                      eq(ventureSettlementShare.farmId, context.farm.id)
                    )
                  ),
              ...(farmsOwn
                ? { farmsOwn: { capitalMoney: his.capitalMoney } }
                : {}),
            };
          }
        );
      }),

    /**
     * The Owner's own money back, at cost, out of the Venture's cash. Before any capital returns, because
     * she put it in to feed their animals and it earned her nothing for doing so.
     */
    repayAdvance: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(
        z.object({
          ventureId: z.string(),
          movedOn: farmDay,
          paymentMethod: z.enum(PAYMENT_METHODS),
          reference: z.string().trim().min(1).max(120),
        })
      )
      .handler(({ context, input }) =>
        moveSettlementMoney(context, input, "advance_repaid", (approved) => {
          if (approved.row.advanceRepaidId) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Your Advance has already come back",
              data: { refusal: "already_paid" },
            });
          }
          const owed = approved.row.advanceMoney;
          if (owed === 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "You put nothing of your own into this Venture",
              data: { refusal: "no_advance_to_repay" },
            });
          }
          return {
            amountMoney: owed,
            mark: (tx: Tx, movementId: string) =>
              tx
                .update(ventureSettlement)
                .set({ advanceRepaidId: movementId })
                .where(
                  and(
                    eq(ventureSettlement.id, approved.row.id),
                    eq(ventureSettlement.farmId, context.farm.id)
                  )
                ),
          };
        })
      ),

    /**
     * The Farm's own share of the profit leaving the Venture Account for the Farm's books.
     *
     * The Farm's money never stays in a Venture Account, whosever name the account is in — the same reason
     * the Owner's Advance is sent back rather than left where it lies.
     */
    takeTheFarmsShare: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(
        z.object({
          ventureId: z.string(),
          movedOn: farmDay,
          paymentMethod: z.enum(PAYMENT_METHODS),
          reference: z.string().trim().min(1).max(120),
          /** The Farm Account the Farm's side of it went into or came out of. */
          farmAccountId: farmAccountIdInput,
        })
      )
      .handler(({ context, input }) =>
        moveSettlementMoney(context, input, "farm_share", (approved) => {
          if (approved.row.farmSharePaidId) {
            throw new ORPCError("BAD_REQUEST", {
              message: "The Farm's share has already been taken",
              data: { refusal: "already_paid" },
            });
          }
          const owed = approved.row.farmMoney;
          if (owed <= 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This Venture made the Farm nothing to take",
              data: { refusal: "no_farm_share_to_take" },
            });
          }
          return {
            amountMoney: owed,
            mark: (tx: Tx, movementId: string) =>
              tx
                .update(ventureSettlement)
                .set({ farmSharePaidId: movementId })
                .where(
                  and(
                    eq(ventureSettlement.id, approved.row.id),
                    eq(ventureSettlement.farmId, context.farm.id)
                  )
                ),
          };
        })
      ),

    /**
     * The Farm's share of a loss, paid into the Venture Account from the Farm's own money.
     *
     * A run that lost money splits the loss as it would have split a profit, by the percentages its Agreements
     * froze: the Investors' part comes off the capital they get back, and the Farm's part is money the account
     * does not hold. Until the Farm puts it there, the payouts the Settlement wrote down add up to more than the
     * account has, and the run could never reach Settled. Paid once, and it closes the Farm's side of the
     * Settlement as taking a share of a profit does.
     */
    coverTheFarmsLoss: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(
        z.object({
          ventureId: z.string(),
          movedOn: farmDay,
          paymentMethod: z.enum(PAYMENT_METHODS),
          reference: z.string().trim().min(1).max(120),
          /** The Farm Account the Farm's side of it went into or came out of. */
          farmAccountId: farmAccountIdInput,
        })
      )
      .handler(({ context, input }) =>
        moveSettlementMoney(context, input, "farm_loss_in", (approved) => {
          if (approved.row.farmSharePaidId) {
            throw new ORPCError("BAD_REQUEST", {
              message: "The Farm's share of the loss has already been paid in",
              data: { refusal: "already_paid" },
            });
          }
          const owed = -approved.row.farmMoney;
          if (owed <= 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This Venture made no loss for the Farm to carry",
              data: { refusal: "no_farm_loss_to_cover" },
            });
          }
          return {
            amountMoney: owed,
            mark: (tx: Tx, movementId: string) =>
              tx
                .update(ventureSettlement)
                .set({ farmSharePaidId: movementId })
                .where(
                  and(
                    eq(ventureSettlement.id, approved.row.id),
                    eq(ventureSettlement.farmId, context.farm.id)
                  )
                ),
          };
        })
      ),

    /**
     * An Investor saying he had his money, recorded against his payout — so the file shows who has
     * confirmed and who has not, rather than the Owner remembering.
     */
    acknowledgePayout: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(
        z.object({
          ventureId: z.string(),
          agreementId: z.string(),
          note: z.string().trim().max(300).optional(),
        })
      )
      .handler(async ({ context, input }) => {
        const now = context.clock.now();
        const row = await ours(context, input.ventureId);
        await audited(context).write(
          {
            entity: "venture_settlement",
            entityId: row.id,
            action: "update",
            before: (tx) => readSettlement(tx, context.farm.id, row.id),
            after: (tx) => readSettlement(tx, context.farm.id, row.id),
          },
          async (tx) => {
            await lockTheFarm(tx, context.farm.id);
            const approved = await approvedSettlementOf(
              tx,
              context.farm.id,
              row.id
            );
            const his = approved?.shares.find(
              (one) => one.agreementId === input.agreementId
            );
            if (!his) {
              throw new ORPCError("NOT_FOUND", {
                message: "This Settlement owes nothing on that Agreement",
              });
            }
            if (!his.paidMovementId) {
              throw new ORPCError("BAD_REQUEST", {
                message: "He cannot have had money nobody has sent him",
                data: { refusal: "not_yet_paid" },
              });
            }
            if (his.acknowledgedAt) {
              // Said once. A second saying would write over the day he said it and whatever he said.
              throw new ORPCError("BAD_REQUEST", {
                message: "He has already said he had it",
                data: { refusal: "already_acknowledged" },
              });
            }
            await tx
              .update(ventureSettlementShare)
              .set({
                acknowledgedAt: now,
                acknowledgedNote: input.note ?? null,
                acknowledgedBy: context.actor.id,
              })
              .where(
                and(
                  eq(ventureSettlementShare.id, his.id),
                  eq(ventureSettlementShare.farmId, context.farm.id)
                )
              );
          }
        );
        return { acknowledged: true as const };
      }),

    /** Settlement Adjustments: a Correction that moved a settled Venture's figures, paid or waived. */
    adjustments: {
      /**
       * Something that landed after the Settlement was approved, written down as an Adjustment.
       *
       * The Settlement's own figures never move and money already paid is never chased. This says what each
       * Investor's share would be now, and whether anything has to be done about it: above the figure the
       * Farm sets, a supplementary payout or a waiver; below it, noted and nothing moves, because a hundred
       * taka should not cost a trip to the bank.
       */
      raise: protectedProcedure
        .use(requireOnly("owner", OWNER_ONLY))
        .use(requirePersonalSession())
        .input(
          z.object({
            ventureId: z.string(),
            /** What arrived late, in the Owner's words. An Investor reading this years later is owed a
             *  reason and not only a figure. */
            reason: z.string().trim().min(1).max(400),
          })
        )
        .handler(async ({ context, input }) => {
          const now = context.clock.now();
          const row = await ours(context, input.ventureId);
          return await audited(context).write(
            {
              entity: "venture_settlement",
              entityId: row.id,
              action: "update",
              reason: input.reason,
              before: (tx) => readSettlement(tx, context.farm.id, row.id),
              after: (tx) => readSettlement(tx, context.farm.id, row.id),
            },
            async (tx) => {
              await lockTheFarm(tx, context.farm.id);
              const approved = await approvedSettlementOf(
                tx,
                context.farm.id,
                row.id
              );
              if (!approved) {
                throw new ORPCError("BAD_REQUEST", {
                  message: "Nothing to adjust until the Settlement is approved",
                  data: { refusal: "not_yet_approved" },
                });
              }
              // Worked out the same way the Settlement was, so the two figures are comparable at all.
              const worked = await settlementOf(
                tx,
                context.farm.id,
                row,
                farmDayOf(now)
              );
              const against = adjustmentAgainst(approved.row, worked);
              if (against.investorsDifferenceMoney === 0) {
                throw new ORPCError("BAD_REQUEST", {
                  message:
                    "Nothing has changed since this Settlement was approved",
                  data: { refusal: "nothing_has_changed" },
                });
              }
              return await raiseAdjustment(
                tx,
                context.farm.id,
                approved.row.id,
                {
                  reason: input.reason,
                  thresholdMoney: context.farm.adjustmentThresholdMoney,
                  against,
                },
                { actorId: context.actor.id, now }
              );
            }
          );
        }),

      /**
       * An outstanding Adjustment paid on top of what was settled: one supplementary payout for each
       * Investor whose Units gained by the late news, against the paper he holds.
       */
      pay: protectedProcedure
        .use(requireOnly("owner", OWNER_ONLY))
        .use(requirePersonalSession())
        .input(
          z.object({
            ventureId: z.string(),
            adjustmentId: z.string(),
            movedOn: farmDay,
            paymentMethod: z.enum(PAYMENT_METHODS),
            reference: z.string().trim().min(1).max(120),
            /** The Farm Account the Farm's side of it went into or came out of: the transfer is the same one. */
            farmAccountId: farmAccountIdInput,
          })
        )
        .handler(async ({ context, input }) => {
          const now = context.clock.now();
          const row = await ours(context, input.ventureId);
          assertByBank(input.paymentMethod);
          return await audited(context).write(
            {
              entity: "venture_settlement",
              entityId: row.id,
              action: "update",
              before: (tx) => readSettlement(tx, context.farm.id, row.id),
              after: (tx) => readSettlement(tx, context.farm.id, row.id),
            },
            async (tx) => {
              await lockTheFarm(tx, context.farm.id);
              const approved = await approvedSettlementOf(
                tx,
                context.farm.id,
                row.id
              );
              if (!approved) {
                throw new ORPCError("BAD_REQUEST", {
                  message: "Nothing to adjust until the Settlement is approved",
                  data: { refusal: "not_yet_approved" },
                });
              }
              const adjustment = await theAdjustment(
                tx,
                context.farm.id,
                approved.row.id,
                input.adjustmentId
              );
              const perUnitMoney = adjustment.perUnitDifferenceMoney;
              if (perUnitMoney <= 0) {
                // The late news was bad. Nothing is chased: an Investor paid on figures the farm gave him
                // keeps what he was paid, so there is nothing to send and this is waived, not paid.
                throw new ORPCError("BAD_REQUEST", {
                  message:
                    "Nothing is owed on this Adjustment; waive it instead",
                  data: { refusal: "nothing_to_pay_on_it" },
                });
              }
              // Less whatever earlier Adjustments already sent: each one restates the whole difference
              // since the Settlement, so paying all of it again would send the same good news twice.
              const raised = await adjustmentsOf(
                tx,
                context.farm.id,
                approved.row.id
              );
              // What this one still has to send, as the Adjustments themselves say it: worked out in one
              // place, so the screen offering to send a figure the farm then refuses cannot happen.
              const perUnitToPay =
                raised.find((one) => one.id === adjustment.id)
                  ?.perUnitToPayMoney ?? 0;
              if (perUnitToPay <= 0) {
                throw new ORPCError("BAD_REQUEST", {
                  message: "Earlier Adjustments have already paid this out",
                  data: { refusal: "nothing_to_pay_on_it" },
                });
              }
              // The Farm's own money, on the Farm's own books: the Venture Account closed when the
              // Settlement was paid out, and news landing after that is the Farm's to make good. One event
              // for each Investor, named, because "what did he get and on what reference" is the whole
              // reason the Settlement's own payouts are recorded one by one.
              const people = await tx.query.investor.findMany({
                where: { farmId: context.farm.id },
                columns: { id: true, name: true },
              });
              const nameOf = new Map(people.map((one) => [one.id, one.name]));
              // The Farm's own Units' part would be the Farm paying itself: it moves nothing, and is left out.
              const itsOwn = await farmsOwnOf(
                tx,
                context.farm.id,
                approved.shares.map((one) => one.agreementId)
              );
              const paying = whatAnAdjustmentSends(
                perUnitToPay,
                approved.shares,
                itsOwn
              );
              let paidMoney = 0;
              for (const [part, his] of paying.entries()) {
                // One transfer, one Money Event for each Investor: each carries the transfer's reference, marked.
                const booking = bookingOf(
                  context,
                  context.roleUsed,
                  now,
                  accountSaid(["settlement_adjustment"], {
                    ...input,
                    reference: referenceOfPart(
                      input.reference,
                      part,
                      paying.length
                    ),
                  })
                );
                const { amountMoney } = his;
                // oxlint-disable-next-line no-await-in-loop -- one transaction, one Investor at a time
                const counterpartyId = await counterpartyNamed(
                  tx,
                  context.farm.id,
                  { name: nameOf.get(his.investorId) ?? his.investorId },
                  now
                );
                // oxlint-disable-next-line no-await-in-loop -- one transaction, one Investor at a time
                await bookMoney(tx, booking, {
                  source: "settlement_adjustment",
                  sourceId: `${adjustment.id}:${his.agreementId}`,
                  amountMoney,
                  occurredAt: startOfFarmDay(input.movedOn),
                  counterpartyId,
                  paymentMethod: input.paymentMethod,
                });
                paidMoney += amountMoney;
              }
              await closeAdjustment(
                tx,
                context.farm.id,
                adjustment.id,
                { outcome: "paid" },
                { actorId: context.actor.id, now }
              );
              return { paidMoney };
            }
          );
        }),

      /**
       * A paid or waived Adjustment opened again, with the Owner's reason: what it sent taken off the Farm's books, one
       * Money Event for each Investor as it was paid, and it stands outstanding to be sent or waived afresh.
       */
      reopen: protectedProcedure
        .use(requireOnly("owner", OWNER_ONLY))
        .use(requirePersonalSession())
        .input(
          z.object({
            ventureId: z.string(),
            adjustmentId: z.string(),
            reason: z.string().trim().min(1).max(400),
          })
        )
        .handler(async ({ context, input }) => {
          const row = await ours(context, input.ventureId);
          await audited(context).write(
            {
              entity: "venture_settlement",
              entityId: row.id,
              action: "correct",
              reason: input.reason,
              before: (tx) => readSettlement(tx, context.farm.id, row.id),
              after: (tx) => readSettlement(tx, context.farm.id, row.id),
            },
            async (tx) => {
              await lockTheFarm(tx, context.farm.id);
              const approved = await approvedSettlementOf(
                tx,
                context.farm.id,
                row.id
              );
              if (!approved) {
                throw new ORPCError("BAD_REQUEST", {
                  message: "Nothing to adjust until the Settlement is approved",
                  data: { refusal: "not_yet_approved" },
                });
              }
              const was = await reopenAdjustment(
                tx,
                context.farm.id,
                approved.row.id,
                input.adjustmentId
              );
              if (was.outcome === "paid") {
                for (const share of approved.shares) {
                  // oxlint-disable-next-line no-await-in-loop -- one transaction, one Investor's payment at a time
                  await forgetTheMoneyOf(
                    tx,
                    "settlement_adjustment",
                    `${input.adjustmentId}:${share.agreementId}`
                  );
                }
              }
            }
          );
          return { reopened: true as const };
        }),

      /**
       * An outstanding Adjustment waived: the Owner deciding it is not worth moving money over, in words
       * she writes down and stands behind.
       */
      waive: protectedProcedure
        .use(requireOnly("owner", OWNER_ONLY))
        .use(requirePersonalSession())
        .input(
          z.object({
            ventureId: z.string(),
            adjustmentId: z.string(),
            /** Why she is letting it go. Asked for, not optional: a waiver nobody explained is a decision
             *  nobody can answer for later. */
            note: z.string().trim().min(1).max(400),
          })
        )
        .handler(async ({ context, input }) => {
          const now = context.clock.now();
          const row = await ours(context, input.ventureId);
          await audited(context).write(
            {
              entity: "venture_settlement",
              entityId: row.id,
              action: "update",
              reason: input.note,
              before: (tx) => readSettlement(tx, context.farm.id, row.id),
              after: (tx) => readSettlement(tx, context.farm.id, row.id),
            },
            async (tx) => {
              await lockTheFarm(tx, context.farm.id);
              const approved = await approvedSettlementOf(
                tx,
                context.farm.id,
                row.id
              );
              const adjustment = await theAdjustment(
                tx,
                context.farm.id,
                approved?.row.id ?? "",
                input.adjustmentId
              );
              await closeAdjustment(
                tx,
                context.farm.id,
                adjustment.id,
                { outcome: "waived", waivedNote: input.note },
                { actorId: context.actor.id, now }
              );
            }
          );
          return { waived: true as const };
        }),
    },
  },
};
