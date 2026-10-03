// The Venture router's part for its account read against the bank, its Advance, its Reimbursements and its movements.
import { uuidv7 } from "@OpenFarm/db/ids";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import { ventureBankCheck, ventureMovement } from "@OpenFarm/db/schema/venture";
import {
  farmDayOf,
  hasEnded,
  monthOf,
  roundMoney,
  RUNNING_STATES,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../../audit";
import { correct } from "../../corrections/correction";
import {
  ventureMovementCorrection,
  ventureMovementCorrectionInput,
  whyItStands,
} from "../../corrections/venture-movement";
import { economicsOfHerd, farmCosts } from "../../cost-store";
import { farmDay } from "../../farm-clock";
import { tagsOfHerRecords } from "../../herd-store";
import { protectedProcedure } from "../../index";
import { farmAccountIdInput, monthInput } from "../../money-inputs";
import { accountSaid, bookMoney, bookingOf } from "../../money-store";
import { aMonthsReimbursement } from "../../reimbursement-store";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../../roles";
import { actOnVenture, assertNotSettledUp, ours } from "../../venture-act";
import { theirProgress } from "../../venture-herd-store";
import type { VentureRow } from "../../venture-store";
import {
  balanceAtMonthEnd,
  directionOf,
  lockTheFarm,
  ownedThenByOf,
  readBankCheck,
  readMovement,
} from "../../venture-store";
import type { Context } from "./shared";
import { assertByBank, money, named } from "./shared";

/** A Venture whose run is over — settled or called off — pays for nothing more. */
const assertStillRunning = (row: { state: VentureRow["state"] }) => {
  if (hasEnded(row.state)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture whose run is over pays for nothing more",
      data: { refusal: "venture_wrong_state" },
    });
  }
};

/**
 * What one Venture's Animals consumed of what the Farm bought, over one month.
 *
 * Charged by who owned her the day she ate it. An Animal sold between purses mid-month is repaid for by
 * each owner for the days that owner had her; one sold to a buyer and gone is still charged to the
 * Venture that owned her while she was here.
 */
const whatItsAnimalsConsumed = async (
  context: Context,
  ventureId: string,
  month: string
) => {
  const [costs, ownedThenBy] = await Promise.all([
    farmCosts(context.db, context.farm.id),
    ownedThenByOf(context.db, context.farm.id),
  ]);
  const { consumed, carried, totalMoney, unpricedKg, uncostedDoses } =
    await aMonthsReimbursement(context.db, context.farm.id, ventureId, month, {
      costs,
      ownedThenBy,
    });
  // Named, not numbered: "which Feed Items, which doses, which Herd Costs" is a list the Owner reads
  // aloud, and an id is not something anybody can read aloud.
  const [items, drugs, categories] = await Promise.all([
    context.db.query.feedItem.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
    context.db.query.drugProduct.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
    context.db.query.moneyCategory.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
  ]);
  return {
    ...consumed,
    /** The month's own figure, before what it carries. */
    ownMoney: consumed.totalMoney,
    carried,
    /** What the transfer comes to: its own figure and every carried line. */
    totalMoney,
    /** Kilos nothing can price and doses nothing can cost, in the month or in a month it carries: it waits for them. */
    unpricedKg,
    uncostedDoses,
    madeOf: {
      feed: named(
        consumed.madeOf.feed,
        new Map(
          items.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      medicine: named(
        consumed.madeOf.medicine,
        new Map(
          drugs.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      herd: named(
        consumed.madeOf.herd,
        new Map(
          categories.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      /** Where each outing went. One name, not two: a haat is called what it is called. A broker at a Sale is named by
       *  the animal sold. */
      trips: named(
        consumed.madeOf.trips,
        new Map<string, { bn: string; en: string | null }>([
          ...[...costs.sellingTrips].map(
            ([id, wentTo]) => [id, { bn: wentTo, en: null }] as const
          ),
          ...costs.animals.flatMap((one) =>
            one.sale
              ? [
                  [
                    one.sale.id,
                    {
                      bn: `দালালি · ${one.tagNumber}`,
                      en: `Broker · ${one.tagNumber}`,
                    },
                  ] as const,
                ]
              : []
          ),
        ])
      ),
    },
  };
};

/**
 * One bank check has one id, made of the Farm, the Venture and the month rather than the clock.
 *
 * A month is read once and put right afterwards, never recorded twice — and an id minted per call would
 * let two readings race into a row one of them then updates under the other's id, leaving the trail with
 * a create that points at nothing.
 */
const idOfTheMonth = (farmId: string, ventureId: string, month: string) =>
  `${farmId}:${ventureId}:${month}`;

export const booksProcedures = {
  /**
   * What the farm thinks a Venture Account held at a month's end, so the Owner has something to hold the
   * bank's statement against before she writes anything down.
   */
  expectedAtMonthEnd: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string(), month: monthInput }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const expectedMoney = await balanceAtMonthEnd(
        context.db,
        context.farm.id,
        row.id,
        input.month
      );
      const already = await context.db.query.ventureBankCheck.findFirst({
        where: {
          farmId: context.farm.id,
          ventureId: row.id,
          forMonth: input.month,
        },
      });
      return {
        expectedMoney,
        checked: already
          ? {
              readMoney: already.readMoney,
              /** What the farm believed when she read the statement, which is not `expectedMoney` once
               *  something has moved in that month since. */
              expectedMoney: already.expectedMoney,
              note: already.note,
              stale: roundMoney(expectedMoney - already.expectedMoney) !== 0,
            }
          : null,
      };
    }),

  /**
   * The month's bank check: what the Venture Account really held, off the bank's own statement, against
   * what the farm thinks it should have held.
   *
   * A month that disagrees is kept as disagreeing. The Owner writes down what she found out about it
   * rather than making it agree, and a Settlement will not close over one — a mistake caught in weeks is
   * one somebody can still remember, and the same mistake at settlement is a figure nobody can unpick.
   */
  checkTheBank: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        month: monthInput,
        /** What the statement said. Signed, because a statement can read below nothing and the farm
         *  would rather be told than have the figure refused. */
        readMoney: z.number().min(-1_000_000_000).max(1_000_000_000),
        /** What she has found out about a difference, where she has found out anything. */
        note: z.string().trim().max(400).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      const { until } = monthOf(startOfFarmDay(`${input.month}-01`));
      if (until > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is not over yet",
          data: { refusal: "month_not_over" },
        });
      }
      if (input.month < farmDayOf(row.createdAt).slice(0, 7)) {
        // A month the Venture did not exist in would read straight against nothing, and a Venture
        // nobody has really checked would look as though somebody had.
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is before this Venture opened",
          data: { refusal: "month_before_the_venture" },
        });
      }
      let expectedMoney = 0;
      // Read for the label alone: whether the trail calls this a first reading or a month put right.
      // What is written is decided inside the lock, so a race can mislabel the act but never the row.
      const readBefore = await context.db.query.ventureBankCheck.findFirst({
        where: { id: idOfTheMonth(context.farm.id, row.id, input.month) },
        columns: { id: true },
      });
      await audited(context).write(
        {
          entity: "venture_bank_check",
          entityId: idOfTheMonth(context.farm.id, row.id, input.month),
          action: readBefore ? "update" : "create",
          reason: input.note,
          before: (tx) =>
            readBankCheck(
              tx,
              context.farm.id,
              idOfTheMonth(context.farm.id, row.id, input.month)
            ),
          after: (tx) =>
            readBankCheck(
              tx,
              context.farm.id,
              idOfTheMonth(context.farm.id, row.id, input.month)
            ),
        },
        async (tx) => {
          // Inside the write, behind the lock its neighbours take: the figure the farm believes is only
          // true until the next movement commits, and two readings of one month must not race into two
          // rows.
          await lockTheFarm(tx, context.farm.id);
          expectedMoney = await balanceAtMonthEnd(
            tx,
            context.farm.id,
            row.id,
            input.month
          );
          const already = await tx.query.ventureBankCheck.findFirst({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
            },
          });
          // A month found to disagree does not come right by being typed again. She may put a misread
          // figure right, but she says what she found out when she does — that is the difference
          // between correcting a reading and quietly making a problem go away.
          const disagreed =
            already !== undefined &&
            roundMoney(already.readMoney - already.expectedMoney) !== 0;
          const agreesNow = roundMoney(input.readMoney - expectedMoney) === 0;
          // Said now, not once before: the note she wrote when it disagreed explains the disagreement,
          // and putting the month right is a different thing to explain.
          if (disagreed && !input.note) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Say what you found out about the month that did not agree",
              data: { refusal: "say_what_you_found_out" },
            });
          }
          await tx
            .insert(ventureBankCheck)
            .values({
              id: idOfTheMonth(context.farm.id, row.id, input.month),
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
              readMoney: input.readMoney,
              expectedMoney,
              note: input.note ?? null,
              checkedBy: context.actor.id,
              checkedAt: now,
            })
            .onConflictDoUpdate({
              target: ventureBankCheck.id,
              set: {
                readMoney: input.readMoney,
                expectedMoney,
                // Kept unless she says something new: re-reading a month must not erase what she
                // found out about it last time. Dropped once the month agrees, because what she found
                // out was about a difference that is no longer there.
                note:
                  input.note ?? (agreesNow ? null : (already?.note ?? null)),
                checkedBy: context.actor.id,
                checkedAt: now,
              },
            });
        }
      );
      return {
        expectedMoney,
        readMoney: input.readMoney,
        differenceMoney: roundMoney(input.readMoney - expectedMoney),
      };
    }),

  /**
   * The Owner's Advance: her own money into a Venture whose Running Budget has run out, so the animals
   * keep eating. Interest-free, never a charge against the Venture, and repaid at cost before any
   * capital returns — which the Settlement will do.
   *
   * It is a movement of the Venture's account and never a Money Event: the Farm has not spent anything
   * and has not earned anything, the Owner has lent her own money to a run she is looking after.
   */
  advance: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        amountMoney: money.refine((amount) => amount > 0, {
          message: "An Advance is money going in",
        }),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const id = uuidv7(now);
      await actOnVenture(context, {
        ventureId: input.ventureId,
        // A Venture that has not started buying has eaten nothing, and one whose run is over has
        // nothing left to feed. An Advance into either would be the Owner's money with no way home:
        // calling a Venture off returns capital, and only capital.
        from: RUNNING_STATES,
        wrongState: "A Venture takes an Advance only while it is running",
        refusedOnceSettled: true,
        trail: {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        apply: async (tx, standing) => {
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: standing.id,
            kind: "advance",
            amountMoney: input.amountMoney,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        },
      });
      return { id };
    }),

  /**
   * What a Venture's cattle are doing: how many stand, how many have gone, what they weighed off the
   * lorry and what they weigh now, what they are putting on in a day, and how many days until the
   * Target Window opens.
   *
   * The Manager reads it as well as the Owner — the roles matrix gives them a Venture's figures, and
   * this is figures about animals they look after every day. What it does not carry is a single word
   * about Investors or what any of them holds.
   *
   * No projection in any of it. The fattening board works out where a rate lands a bull at the window
   * and whether that makes his target, and the Owner is welcome to that; this is the reading an
   * Investor's paper is made from, and a future weight on a sheet he keeps reads as a promise.
   */
  herd: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await theirProgress(
        context.db,
        context.farm.id,
        row,
        context.clock.now()
      );
    }),

  /**
   * Which of a Venture's bulls earned and which did not: each one's Margin and Cost of Gain, and the
   * herd's own.
   *
   * The Owner's alone. The Manager reads the herd's weights because he looks after them every day; what
   * a beast made is the money side of a Venture, and that is hers. An Investor never sees it either —
   * he is told what the whole run cost and what it fetched, not which bull disappointed.
   */
  economics: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const [costs, mine] = await Promise.all([
        farmCosts(context.db, context.farm.id),
        context.db.query.animal.findMany({
          where: { farmId: context.farm.id, ownerVentureId: row.id },
          columns: { id: true },
        }),
      ]);
      return economicsOfHerd(costs, new Set(mine.map((one) => one.id)));
    }),

  /**
   * What a Venture's Animals consumed in a month, and what it is made of — before anything is moved, so
   * the Owner sees the figure and its parts and can read them to an Investor.
   */
  consumption: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string(), month: monthInput }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await whatItsAnimalsConsumed(context, row.id, input.month);
    }),

  /**
   * The month's Reimbursement: what this Venture's Animals ate of the Farm's feed, were dosed with of
   * the Farm's medicine, cost in vet visits, and their share of the month's Herd Costs — moved from the
   * Venture Account to the Farm's.
   *
   * One act, both sides. A movement out of the Venture, and a Money Event **in** on the Farm's purse
   * under its own Category — gross, not netted: the Farm's expense when it bought the feed stands, and
   * the Venture's repayment stands beside it. This is also how home-grown fodder settles, which the Farm
   * never paid cash for and is genuinely selling.
   */
  reimburse: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        month: monthInput,
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
        /** The Farm Account the Farm's side of it went into or came out of: the transfer is the same one. */
        farmAccountId: farmAccountIdInput,
        /** The figure the Owner read before she committed. Refused when it is not what the farm works
         *  out now — a Feeding entered late, or a Category re-marked, moves the sum she was shown. */
        amountMoney: money,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const row = await ours(context, input.ventureId);
      assertStillRunning(row);
      // The month has to be over. Reimbursing a month still running would take a part-month figure and
      // then lock the rest of it out for good, because a Venture is reimbursed once a month.
      const { until } = monthOf(startOfFarmDay(`${input.month}-01`));
      if (until > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is not over yet",
          data: { refusal: "month_not_over" },
        });
      }
      const consumed = await whatItsAnimalsConsumed(
        context,
        row.id,
        input.month
      );
      // Asked before anything else: a month with feed nothing can price, or a dose nothing can cost, would repay the Farm
      // nothing for them — and the Settlement, which refuses an unpriced kilo, would then price it into a month paid.
      if (consumed.unpricedKg > 0 || consumed.uncostedDoses > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Something its animals ate or were dosed with that month has no price yet",
          data: {
            refusal: "a_price_is_missing",
            unpricedKg: consumed.unpricedKg,
            uncostedDoses: consumed.uncostedDoses,
          },
        });
      }
      // Asked first: a month that comes to nothing or less — its lines carried back more than it ate — sends nothing,
      // and what it carries rides on to the month after.
      if (consumed.totalMoney <= 0) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Its animals consumed nothing that month, or less than what it carries back",
          data: { refusal: "nothing_to_reimburse" },
        });
      }
      if (roundMoney(input.amountMoney) !== consumed.totalMoney) {
        throw new ORPCError("BAD_REQUEST", {
          message: `That month now comes to ${consumed.totalMoney}`,
          data: { refusal: "amount_changed", totalMoney: consumed.totalMoney },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          reason: input.month,
          after: async (tx) => ({
            ...(await readMovement(tx, context.farm.id, id)),
            madeOf: consumed.madeOf,
            carried: consumed.carried,
          }),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          await assertNotSettledUp(tx, context.farm.id, row.id);
          // Asked again behind the lock: a Venture settled or called off at the same moment pays for nothing more.
          const standing = await tx.query.venture.findFirst({
            where: { id: row.id, farmId: context.farm.id },
            columns: { state: true },
          });
          if (standing) {
            assertStillRunning(standing);
          }
          const already = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
            },
            columns: { id: true },
          });
          if (already) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That month has been reimbursed already",
              data: { refusal: "month_already_reimbursed" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "reimbursement",
            forMonth: input.month,
            amountMoney: consumed.totalMoney,
            carried: consumed.carried,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          // The Farm's side, on the Farm's purse: it bought the feed and is being paid for it.
          await bookMoney(
            tx,
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["reimbursement"], input)
            ),
            {
              source: "reimbursement",
              sourceId: id,
              amountMoney: consumed.totalMoney,
              occurredAt: startOfFarmDay(input.movedOn),
              counterpartyId: null,
              paymentMethod: input.paymentMethod,
            }
          );
        }
      );
      return { id, ...consumed };
    }),

  /**
   * A movement of a Venture's money put right: how much moved, the day the bank moved it, or the
   * reference on the instrument. A Correction like any other — a reason, and the trail holding what it
   * said before.
   *
   * Refused where the farm has already built something on it: a Float counted home, a month reimbursed,
   * a Venture settled. Changing a figure underneath a decision somebody has already made is not putting
   * anything right.
   */
  correctMovement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(ventureMovementCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, ventureMovementCorrection, input)
    ),

  /** Every movement of one Venture's money, oldest first: what came in, and what went back. */
  movements: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.ventureMovement.findMany({
        where: { farmId: context.farm.id, ventureId: input.ventureId },
        orderBy: { movedOn: "asc", id: "asc" },
      });
      if (rows.length === 0) {
        return [];
      }
      // Only the movements that belong to one Investor's paper have one; a Float belongs to none.
      const papers = rows.flatMap((one) =>
        one.agreementId ? [one.agreementId] : []
      );
      const agreements =
        papers.length === 0
          ? []
          : await context.db.query.investmentAgreement.findMany({
              where: { farmId: context.farm.id, id: { in: papers } },
              columns: { id: true, investorId: true },
            });
      const whose = new Map(
        agreements.map((one) => [one.id, one.investorId] as const)
      );
      // What a Correction would be refused for, row by row, by the one rule the Correction refuses by — so the
      // list offers Correct only where the farm will take it.
      const run = await context.db.query.venture.findFirst({
        where: { id: input.ventureId, farmId: context.farm.id },
        columns: { state: true },
      });
      const countedTrips = new Set(
        rows.flatMap((one) =>
          one.kind === "float_out" &&
          one.reconciledAt !== null &&
          one.buyingTripId
            ? [one.buyingTripId]
            : []
        )
      );
      // The animal a sale's money, an Internal Sale's, or a bull bought by bank was for — so the row names her and
      // reaches her page.
      const tagOf = await tagsOfHerRecords(context.db, context.farm.id, {
        intakeIds: rows.flatMap((one) => (one.intakeId ? [one.intakeId] : [])),
        saleIds: rows.flatMap((one) => (one.saleId ? [one.saleId] : [])),
        internalSaleIds: rows.flatMap((one) =>
          one.internalSaleId ? [one.internalSaleId] : []
        ),
      });
      return rows.map((one) => ({
        id: one.id,
        kind: one.kind,
        /** The animal it was for, where it was a Sale's, an Internal Sale's or a bull bought by bank's money. */
        tagNumber:
          tagOf.get(one.saleId ?? one.internalSaleId ?? one.intakeId ?? "") ??
          null,
        /** The Intake of a bull bought by bank with no outing, which it is written from. */
        intakeId: one.intakeId,
        /** Which way it moved the account, so a list of them can be added up to the balance the farm keeps. */
        direction: directionOf(one.kind),
        agreementId: one.agreementId,
        investorId: one.agreementId
          ? (whose.get(one.agreementId) ?? null)
          : null,
        buyingTripId: one.buyingTripId,
        amountMoney: one.amountMoney,
        movedOn: one.movedOn,
        reference: one.reference,
        refundsId: one.refundsId,
        /** Why it may not be put right, as the farm's word for it; null where it may. */
        whyItStands:
          whyItStands(
            one,
            run?.state,
            one.buyingTripId !== null && countedTrips.has(one.buyingTripId)
          )?.refusal ?? null,
      }));
    }),
};
