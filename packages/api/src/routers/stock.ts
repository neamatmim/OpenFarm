import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { FEED_IN_KINDS, feedIn } from "@OpenFarm/db/schema/feed";
import { maundsOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  feedArrivalCorrection,
  feedArrivalCorrectionInput,
} from "../corrections/feed-arrival";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { paymentMethodInput } from "../money-inputs";
import { bookingOf } from "../money-store";
import { requireRole } from "../roles";
import {
  assertShapeOf,
  bookPurchaseMoney,
  feedPriceInput,
  quantityInput,
  readFeedArrival,
  receivedDay,
  sellerInput,
  adjustmentsOf,
  stockOnHand,
  fodderValueOf,
} from "../stock-store";

export const stockRouter = {
  /**
   * What is in the store, Feed Item by Feed Item, and what a unit of each cost.
   *
   * The Owner's to read and the Manager's to keep (roles matrix: Feed stock — Owner R, Manager C R
   * U). Barn Staff and the Vet see none of it: it carries prices, and money is never theirs.
   */
  onHand: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) => stockOnHand(context.db, context.farm.id)),

  /**
   * Everything that came into the store, newest first: what, how much — in maunds as well, for feed
   * weighed in kilos, because a trader's slip is in maunds — what it cost, who sold it, and when.
   */
  arrivals: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ feedItemId: z.string().optional() }).default({}))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.feedIn.findMany({
        where: {
          farmId: context.farm.id,
          ...(input.feedItemId ? { feedItemId: input.feedItemId } : {}),
        },
        with: {
          feedItem: { columns: { nameBn: true, unit: true } },
          seller: { columns: { name: true } },
        },
        orderBy: { receivedOn: "desc", id: "desc" },
        limit: 200,
      });
      return rows.map(({ feedItem, seller, ...row }) => {
        const quantity = Number(row.quantity);
        return {
          id: row.id,
          feedItemId: row.feedItemId,
          nameBn: feedItem.nameBn,
          unit: feedItem.unit,
          kind: row.kind,
          quantity,
          maunds: feedItem.unit === "kg" ? maundsOf(quantity) : null,
          priceBdt: row.priceBdt,
          sellerName: seller?.name ?? null,
          receivedOn: row.receivedOn,
          recordedAt: row.recordedAt,
        };
      });
    }),

  /**
   * The differences the Stock Counts booked, newest first, as they read now — so a late entry dated
   * before a count shows in it — with who counted and why. A count that agreed is not listed.
   */
  adjustments: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ feedItemId: z.string().optional() }).default({}))
    .handler(({ context, input }) =>
      adjustmentsOf(context.db, context.farm.id, input.feedItemId)
    ),

  /**
   * Feed coming into the store: a Purchase — how much, what the lot cost, and who sold it — or a
   * Harvest from the farm's own fields.
   *
   * The Manager's to record, or the Owner's, who may do anything the Manager does. Carries the id the
   * screen made for this entry, so a second tap on the same form is the same arrival and not a second
   * lorry. A retired Feed Item takes nothing in: it is kept for what it was fed, not for buying more of.
   */
  receive: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string().uuid().optional(),
        feedItemId: z.string(),
        kind: z.enum(FEED_IN_KINDS),
        quantity: quantityInput,
        priceBdt: feedPriceInput.optional(),
        seller: sellerInput.optional(),
        receivedOn: farmDay,
        /** How the seller was paid, for a purchase. */
        paymentMethod: paymentMethodInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const recordedByRole = context.roleUsed;
      if (!recordedByRole) {
        throw new ORPCError("FORBIDDEN");
      }
      assertShapeOf({
        kind: input.kind,
        priced: input.priceBdt !== undefined,
        seller: input.seller !== undefined,
      });
      const receivedOn = receivedDay(input.receivedOn, now);
      const id = input.id ?? newId(now);
      const already = await context.db.query.feedIn.findFirst({
        where: { id, farmId: context.farm.id },
        columns: { id: true },
      });
      if (already) {
        return { id };
      }
      const item = await context.db.query.feedItem.findFirst({
        where: { id: input.feedItemId, farmId: context.farm.id },
        columns: { id: true, retiredAt: true, fodderPriceBdt: true },
      });
      if (!item) {
        throw new ORPCError("NOT_FOUND", { message: "No such feed" });
      }
      if (item.retiredAt) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That feed is retired; bring it back before buying more",
          data: { refusal: "feed_retired" },
        });
      }
      await audited(context).write(
        {
          entity: "feed_in",
          entityId: id,
          action: "create",
          after: (tx) => readFeedArrival(tx, id),
        },
        async (tx) => {
          const sellerId = input.seller
            ? await counterpartyNamed(tx, context.farm.id, input.seller, now)
            : null;
          await tx.insert(feedIn).values({
            id,
            farmId: context.farm.id,
            feedItemId: item.id,
            kind: input.kind,
            quantity: input.quantity.toFixed(1),
            // A purchase is worth what the farm paid; a Harvest is worth what the farm says its own
            // fodder is worth, taken from the Feed Item rather than typed by whoever cut it.
            priceBdt:
              input.kind === "harvest"
                ? fodderValueOf(item, input.quantity)
                : (input.priceBdt ?? null),
            counterpartyId: sellerId,
            receivedOn,
            recordedBy: context.actor.id,
            recordedByRole,
            recordedAt: now,
          });
          await bookPurchaseMoney(
            tx,
            bookingOf(context, recordedByRole, now),
            id,
            input.paymentMethod
          );
        }
      );
      return { id };
    }),

  /**
   * Puts right feed recorded coming in: how much, what it cost, who sold it, or the day. A Correction
   * like any other — a reason, the Role's Correction Window, and the trail holding what it said before —
   * because 5000 kg typed for 500 would otherwise sit in the store, and in its price, for good.
   */
  correct: protectedProcedure
    .use(requireRole(...feedArrivalCorrection.roles))
    .input(feedArrivalCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, feedArrivalCorrection, input)
    ),
};
