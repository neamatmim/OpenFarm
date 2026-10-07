// The Venture router's part for animals moved between purses, and what is left bought by the Farm.
import { uuidv7 } from "@OpenFarm/db/ids";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import type { BetweenPursesRefusal } from "@OpenFarm/domain";
import {
  farmDayOf,
  isRunning,
  roundMoney,
  weighedTooLongAgo,
  whyNotBetweenPurses,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../../audit";
import { audited } from "../../audit";
import { farmDay, targetWindowInput } from "../../farm-clock";
import { protectedProcedure } from "../../index";
import { recordInternalSale } from "../../internal-sale-store";
import { farmAccountIdInput } from "../../money-inputs";
import { accountSaid, bookingOf } from "../../money-store";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../../roles";
import { assertNotSettledUp, ours } from "../../venture-act";
import {
  assertCattleBudgetHolds,
  lockTheFarm,
  priceAtWeight,
  readInternalSale,
  readVenture,
  stillHersOf,
  whatSheLastWeighed,
  windowInForceOn,
  windUpDaysOf,
  windUpEndsOn,
  withWindowsInForce,
} from "../../venture-store";
import { assertByBank } from "./shared";

/** Why an Internal Sale would not take her, as the farm says it in its refusal. */
const BETWEEN_PURSES_SAID: Record<BetweenPursesRefusal, string> = {
  not_a_fattening_animal:
    "Investor money funds Fattening, and a Dairy cow is the Farm's",
  not_a_ventures_animal: "A Venture owns bought-in animals and no others",
  // Sold, died or culled: there is no animal left to move, and a Venture paying for one would be paying its Investors'
  // money for a carcass.
  she_is_gone: "She has left the farm, and there is no animal to move",
  she_is_ready_for_sale:
    "She is ready for sale, and a finished bull is not moved between purses",
  never_weighed: "She has never been weighed, so there is no price to strike",
};

/**
 * That a Venture may still trade animals: it has started and has not finished. A Venture that is
 * selling is counting what it holds, and one settled or called off has nothing left to move.
 */
const assertVentureMayTrade = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  id: string | null,
  side: "buyer" | "seller"
) => {
  if (id === null) {
    return;
  }
  const row = await tx.query.venture.findFirst({
    where: { id, farmId },
    columns: { state: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  if (row.state !== "buying" && row.state !== "fattening") {
    // Which side is at fault, because "the Venture is not where it would have to be" is no help when
    // there are two of them.
    throw new ORPCError("BAD_REQUEST", {
      message: `The ${side}'s Venture is ${row.state}, and does not trade animals`,
      data: {
        refusal:
          side === "buyer" ? "buyer_cannot_trade" : "seller_cannot_trade",
      },
    });
  }
};

/**
 * Refuses a price struck on a weighing older than the Owner's days: she has eaten since, and the Owner can put her on
 * the scale tomorrow. Her tag, the day and how old, as an unweighed one is named.
 */
const assertWeighedLately = (
  tagNumber: string,
  weighedAt: Date,
  day: string,
  days: number
) => {
  const old = weighedTooLongAgo(weighedAt, day, days);
  if (old) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${tagNumber} was last weighed on ${old.weighedOn}, ${old.days} days before; weigh her again first`,
      data: { refusal: "weighed_too_long_ago", tagNumber, ...old },
    });
  }
};

export const tradingProcedures = {
  /**
   * The animals that may move from one purse to another, for the Owner choosing one: bought-in Fattening animals
   * still on the farm, not yet Ready for Sale, weighed at least once, and in a purse that still trades — the Farm's
   * own, or a Venture buying or fattening: the ones an Internal Sale would take —
   * with the purse each is in now and what she last weighed, which is what her price is struck on.
   *
   * The sale still asks every one of these again inside its lock: this is what to offer, not the permission.
   */
  movableAnimals: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      const rows = await context.db.query.animal.findMany({
        where: {
          farmId: context.farm.id,
          side: "fattening",
          source: "bought",
          state: { in: ["quarantine", "fattening"] },
        },
        columns: { id: true, tagNumber: true, state: true },
        with: {
          pen: { columns: { name: true } },
          owner: { columns: { id: true, name: true, state: true } },
          // What her price would be struck on: her latest reading the farm did not doubt, as the sale reads it.
          weighIns: {
            where: { flaggedNote: { isNull: true } },
            columns: { weightKg: true, weighedAt: true },
            orderBy: { weighedAt: "desc", id: "desc" },
            limit: 1,
          },
        },
        orderBy: { tagNumber: "asc", id: "asc" },
      });
      return rows.flatMap(({ weighIns, pen, owner, ...her }) => {
        const weighed = weighIns.at(0);
        const herPurseTrades =
          owner === null ||
          owner.state === "buying" ||
          owner.state === "fattening";
        return weighed && herPurseTrades
          ? [
              {
                ...her,
                penName: pen.name,
                /** Whose she is now: a Venture, or null for the Farm's own herd. */
                purse: owner ? { id: owner.id, name: owner.name } : null,
                weightKg: Number(weighed.weightKg),
                weighedAt: weighed.weighedAt,
              },
            ]
          : [];
      });
    }),

  /**
   * The Ventures an Animal may be written against, by name and the state they are in: one still buying
   * takes an Intake, and one buying or fattening takes an Internal Sale.
   *
   * The Manager's as well as the Owner's, because the Manager records the Intake and the roles matrix
   * gives her the owner on it. What a Venture is planned by, what it holds and who is in it stay the
   * Owner's: this says only which names may be written against a beast today.
   */
  takingAnimals: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.venture.findMany({
        where: {
          farmId: context.farm.id,
          state: { in: ["buying", "fattening"] },
        },
        columns: {
          id: true,
          name: true,
          state: true,
          targetWindowStart: true,
          targetWindowEnd: true,
        },
        orderBy: { createdAt: "desc", id: "desc" },
      });
      // The window an animal taken in for one is sold in: hers is the Venture's, as its Amendments leave it today.
      const inForce = await withWindowsInForce(
        context.db,
        context.farm.id,
        rows,
        farmDayOf(context.clock.now())
      );
      return inForce.map(({ targetWindowStart, targetWindowEnd, ...one }) => ({
        ...one,
        targetWindow: { start: targetWindowStart, end: targetWindowEnd },
      }));
    }),

  /**
   * An Animal sold between the Farm's herd and a Venture, or between two Ventures.
   *
   * Priced at her latest Weigh-in times a live-weight rate the Owner enters that day, with a note of
   * where the rate came from — an Investor asking years later why his bull was worth that is owed a
   * figure and a reason. The money moves through the Venture Account, because it is a sale and not a
   * book entry, and her owner changes with it.
   *
   * Refused once the Venture is selling and refused for an Animal who is Ready for Sale: a finished
   * bull may not be lifted out of the pool at the moment she becomes worth having.
   */
  sellInternally: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(20),
        /** Who takes her on: a Venture, or left out for the Farm's own herd. */
        toVentureId: z.string().optional(),
        /** Taka per kilogramme of live weight, as the day's market gives it. */
        rateMoneyPerKg: z.number().positive().max(100_000),
        /** Where the rate came from. Asked for, not optional. */
        note: z.string().trim().min(1).max(300),
        soldOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        /** The transfer, cheque or deposit slip the money moved on. */
        reference: z.string().trim().min(1).max(120),
        /** The Farm Account the Farm's side of it went into or came out of: the transfer is the same one. */
        farmAccountId: farmAccountIdInput,
        /** The price the Owner read before she committed. Refused when it is not the price the farm
         *  works out, because she may be looking at a weight taken before this morning's round. */
        priceMoney: z.number().positive().max(100_000_000),
        /** Where the Farm takes her on: the Season she joins. The next Eid where none is said. */
        targetWindow: targetWindowInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const id = uuidv7(now);
      let struck = { weightKg: 0, priceMoney: 0 };
      await audited(context).write(
        {
          entity: "internal_sale",
          entityId: id,
          action: "create",
          reason: input.note,
          after: (tx) => readInternalSale(tx, context.farm.id, id),
        },
        async (tx) => {
          // Everything inside the write, behind the lock every count of a Venture's money takes: she
          // may be marked Ready for Sale, or a Venture moved on, between reading and writing.
          await lockTheFarm(tx, context.farm.id);
          const her = await tx.query.animal.findFirst({
            where: {
              farmId: context.farm.id,
              tagNumber: input.tagNumber.toUpperCase(),
            },
            columns: {
              id: true,
              side: true,
              state: true,
              source: true,
              ownerVentureId: true,
            },
          });
          if (!her) {
            throw new ORPCError("NOT_FOUND", { message: "No such animal" });
          }
          // The same rule the screen offers the move by (`whyNotBetweenPurses`), refused in its words.
          const refusal = whyNotBetweenPurses(her);
          if (refusal) {
            throw new ORPCError("BAD_REQUEST", {
              message: BETWEEN_PURSES_SAID[refusal],
              data: { refusal },
            });
          }
          const from = her.ownerVentureId;
          const to = input.toVentureId ?? null;
          if (from === to) {
            throw new ORPCError("BAD_REQUEST", {
              message: "She is already theirs",
              data: { refusal: "already_that_purse" },
            });
          }
          await assertVentureMayTrade(tx, context.farm.id, from, "seller");
          await assertVentureMayTrade(tx, context.farm.id, to, "buyer");
          const weighed = await whatSheLastWeighed(tx, context.farm.id, her.id);
          if (!weighed) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "She has never been weighed, so there is no price to strike",
              data: { refusal: "never_weighed" },
            });
          }
          assertWeighedLately(
            input.tagNumber,
            weighed.weighedAt,
            input.soldOn,
            context.farm.priceWeighInDays
          );
          const priceMoney = priceAtWeight(
            weighed.weightKg,
            input.rateMoneyPerKg
          );
          if (roundMoney(input.priceMoney) !== priceMoney) {
            // She was weighed again since the Owner read the figure: the price she is committing to is
            // not the price the farm would strike, and a sale is not something to guess at.
            throw new ORPCError("BAD_REQUEST", {
              message: `She last weighed ${weighed.weightKg} kg, so the price is ${priceMoney}`,
              data: { refusal: "weighed_again_since", priceMoney },
            });
          }
          if (to !== null) {
            // The buyer pays out of what it holds for cattle, exactly as it would at the livestock market.
            const buyer = await ours(context, to);
            await assertCattleBudgetHolds(
              tx,
              context.farm.id,
              buyer,
              priceMoney
            );
          }
          struck = await recordInternalSale(
            tx,
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["internal_sale_in", "internal_sale_out"], input)
            ),
            {
              id,
              animalId: her.id,
              from,
              to,
              weighed,
              rateMoneyPerKg: input.rateMoneyPerKg,
              targetWindow: input.targetWindow,
              note: input.note,
              soldOn: input.soldOn,
              paymentMethod: input.paymentMethod,
              reference: input.reference,
            }
          );
        }
      );
      return { id, ...struck, rateMoneyPerKg: input.rateMoneyPerKg };
    }),

  /**
   * What a Venture still holds, each with what she last weighed, so the Owner can work the buy-back out
   * before she commits to it rather than read the total off a receipt.
   *
   * An Animal nobody has weighed comes back with nothing where her weight should be, which is the same
   * answer the buy-back refuses on — said while there is still time to put her on the scale.
   */
  whatIsLeft: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const hers = await stillHersOf(context.db, context.farm.id, row.id);
      const weights = await Promise.all(
        hers.map((her) =>
          whatSheLastWeighed(context.db, context.farm.id, her.id)
        )
      );
      const window = await windowInForceOn(
        context.db,
        context.farm.id,
        row,
        farmDayOf(context.clock.now())
      );
      return {
        windUpEndsOn: windUpEndsOn(
          window.targetWindowEnd,
          windUpDaysOf(row, context.farm)
        ),
        animals: hers.map((her, at) => ({
          tagNumber: her.tagNumber,
          weightKg: weights[at]?.weightKg ?? null,
          /** When, so the sheet can name one weighed too long ago before the buy-back refuses her. */
          weighedAt: weights[at]?.weighedAt ?? null,
        })),
        /** How old a weighing may be to be priced on, as the buy-back will judge it. */
        priceWeighInDays: context.farm.priceWeighInDays,
      };
    }),

  /**
   * The buy-back at wind-up: the Wind-up Period has ended, animals are still standing, and the Farm takes
   * every one of them off the Venture at weight so it can settle on time.
   *
   * Its own act at a fixed moment, and not the Owner's discretionary Internal Sale — which is refused
   * once a Venture is Selling precisely so a finished bull cannot be lifted out of the pool. The
   * difference is the moment: this happens because the clock says so and takes everything left, where an
   * Internal Sale is the Owner choosing one animal on a day of her choosing. Priced the same way all the
   * same, because a price an Investor can check is the same price either way.
   */
  buyWhatIsLeft: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        /** Taka per kilogramme of live weight, as the day's market gives it. One rate for the lot: it
         *  is one act on one day, and each animal's own weight is what makes her price her own. */
        rateMoneyPerKg: z.number().positive().max(100_000),
        /** Where the rate came from. Asked for, not optional. */
        note: z.string().trim().min(1).max(300),
        boughtOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        /** The transfer, cheque or deposit slip the money moved on. */
        reference: z.string().trim().min(1).max(120),
        /** The Farm Account the Farm's side of it went into or came out of: the transfer is the same one. */
        farmAccountId: farmAccountIdInput,
        /** The one Season every animal it takes joins: the next Eid where none is said. */
        targetWindow: targetWindowInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      // Read once for the Audit Event's subject; everything the act turns on is read again under the
      // lock, because a Venture can be called off between the two.
      const row = await ours(context, input.ventureId);
      let bought: {
        tagNumber: string;
        weightKg: number;
        priceMoney: number;
      }[] = [];
      await audited(context).write(
        {
          entity: "venture",
          entityId: row.id,
          action: "update",
          reason: input.note,
          before: (tx) => readVenture(tx, context.farm.id, row.id),
          after: (tx) => readVenture(tx, context.farm.id, row.id),
        },
        async (tx) => {
          // Behind the lock every count of a Venture's money takes, and everything the act turns on is
          // read after it: one of them may be sold at the livestock market, or the Venture called off, between
          // reading which are left and buying them.
          await lockTheFarm(tx, context.farm.id);
          await assertNotSettledUp(tx, context.farm.id, row.id);
          const held = await tx.query.venture.findFirst({
            where: { id: row.id, farmId: context.farm.id },
            columns: {
              id: true,
              state: true,
              targetWindowStart: true,
              targetWindowEnd: true,
              windUpDays: true,
            },
          });
          // A run still going, whichever stage it is at. One that never sold a single bull is exactly
          // the case the clock exists for — but one called off has sent its money back, and one settled
          // has closed its books, and neither takes animals off anybody.
          if (!(held && isRunning(held.state))) {
            throw new ORPCError("BAD_REQUEST", {
              message: `A Venture is bought out while it is running, and this one is ${held?.state}`,
              data: { refusal: "venture_wrong_state" },
            });
          }
          // From the window its Investors signed last: an Amendment that moved it moved their Wind-up too.
          const window = await windowInForceOn(
            tx,
            context.farm.id,
            held,
            farmDayOf(now)
          );
          const endsOn = windUpEndsOn(
            window.targetWindowEnd,
            windUpDaysOf(held, context.farm)
          );
          if (farmDayOf(now) <= endsOn) {
            throw new ORPCError("BAD_REQUEST", {
              message: `The Wind-up Period runs to ${endsOn}`,
              data: { refusal: "wind_up_not_over", endsOn },
            });
          }
          if (input.boughtOn <= endsOn) {
            // The day it is booked on is what the movements, the Money Event and every month's books
            // read off. Left free, the Owner could wait a day and then write the buy-back back inside
            // the very period it is only allowed to happen after.
            throw new ORPCError("BAD_REQUEST", {
              message: `The Wind-up Period runs to ${endsOn}, so it cannot have happened on ${input.boughtOn}`,
              data: { refusal: "wind_up_not_over", endsOn },
            });
          }
          const hers = await stillHersOf(tx, context.farm.id, row.id);
          if (hers.length === 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This Venture has no animals left to buy",
              data: { refusal: "nothing_left_to_buy" },
            });
          }
          const taken: typeof bought = [];
          for (const her of hers) {
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            const weighed = await whatSheLastWeighed(
              tx,
              context.farm.id,
              her.id
            );
            if (!weighed) {
              // Her tag in the message, because a price nobody can defend is worse than a delay. The
              // Owner is told which animal to put on the scale before she gets here, by the list the
              // sheet reads from `whatIsLeft` — this is the farm refusing to guess all the same.
              throw new ORPCError("BAD_REQUEST", {
                message: `${her.tagNumber} has never been weighed, so there is no price to strike`,
                data: { refusal: "never_weighed", tagNumber: her.tagNumber },
              });
            }
            assertWeighedLately(
              her.tagNumber,
              weighed.weighedAt,
              input.boughtOn,
              context.farm.priceWeighInDays
            );
            const saleId = uuidv7(now);
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            const struck = await recordInternalSale(
              tx,
              bookingOf(
                context,
                context.roleUsed,
                now,
                accountSaid(["internal_sale_in", "internal_sale_out"], input)
              ),
              {
                id: saleId,
                animalId: her.id,
                from: row.id,
                to: null,
                weighed,
                rateMoneyPerKg: input.rateMoneyPerKg,
                targetWindow: input.targetWindow,
                note: input.note,
                soldOn: input.boughtOn,
                paymentMethod: input.paymentMethod,
                reference: input.reference,
              }
            );
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            const after = await readInternalSale(tx, context.farm.id, saleId);
            // Its own Audit Event, as an Internal Sale made one at a time has: what the Owner is asked
            // years later is why this bull was worth that, not what the day came to.
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            await audited(context).recordEvent(
              tx,
              {
                entity: "internal_sale",
                entityId: saleId,
                action: "create",
                reason: input.note,
              },
              { after }
            );
            taken.push({
              tagNumber: her.tagNumber,
              weightKg: struck.weightKg,
              priceMoney: struck.priceMoney,
            });
          }
          bought = taken;
        }
      );
      return {
        animals: bought,
        totalMoney: roundMoney(
          bought.reduce((sum, one) => sum + one.priceMoney, 0)
        ),
        rateMoneyPerKg: input.rateMoneyPerKg,
      };
    }),
};
