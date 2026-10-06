import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { FEED_IN_KINDS, FEED_PACKS, feedIn } from "@OpenFarm/db/schema/feed";
import type { FeedPack, FeedUnit } from "@OpenFarm/domain";
import { FEED_IN_SHOWN, maundsOf, quantityOfPacks } from "@OpenFarm/domain";
import { expiryStanding, expiryWindow } from "@OpenFarm/domain/lots";
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
import { assertNotExpiredWhenBought, lotFields } from "../lot-input";
import {
  farmAccountIdInput,
  paymentMethodInput,
  referenceInput,
} from "../money-inputs";
import { accountSaid, bookingOf } from "../money-store";
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
  lastPurchaseOf,
  purchasePricesIn,
  scaleBySeller,
  tellIfTheFeedCameDearer,
} from "../stock-store";

/**
 * How much came, in the feed's own unit: as typed, or worked out from the bags or maunds a trader's slip gives — one or
 * the other, never both. A pack that cannot be turned into kilos is refused with why: feed not counted in kilos has
 * none, and a bag weighs only what the farm has said this feed's bags weigh.
 */
const quantityReceived = (
  input: { quantity?: number; pack?: { kind: FeedPack; count: number } },
  item: { unit: FeedUnit; bagSizeKg: string | null }
): number => {
  if ((input.quantity === undefined) === (input.pack === undefined)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Say how much came — in its own unit, or in bags or maunds",
    });
  }
  if (input.quantity !== undefined) {
    return input.quantity;
  }
  const packed = quantityOfPacks(input.pack ?? { kind: "bag", count: 0 }, {
    unit: item.unit,
    bagSizeKg: item.bagSizeKg === null ? null : Number(item.bagSizeKg),
  });
  if ("refusal" in packed) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        packed.refusal === "pack_needs_kg"
          ? "Only feed counted in kilos is bought by the bag or the maund"
          : "Say what a bag of this feed weighs first",
      data: { refusal: packed.refusal },
    });
  }
  return packed.quantity;
};

/**
 * What the farm's scale showed, where the lot was weighed: only a Purchase, which has a slip to weigh against, and only
 * feed counted in kilos, which is what a scale says. Nothing where it was not weighed.
 */
const weighedOnArrival = (
  input: { kind: string; weighed?: number },
  item: { unit: FeedUnit }
): number | null => {
  if (input.weighed === undefined) {
    return null;
  }
  if (input.kind !== "purchase" || item.unit !== "kg") {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Only feed bought by the kilo is weighed against the seller's slip",
      data: { refusal: "weighed_needs_a_kilo_slip" },
    });
  }
  return input.weighed;
};

export const stockRouter = {
  /**
   * What is in the store, Feed Item by Feed Item, and what a unit of each cost.
   *
   * The Owner's to read and the Manager's to keep (roles matrix: Feed stock — Owner R, Manager C R
   * U). Barn Staff and the Vet see none of it: it carries prices, and money is never theirs.
   */
  onHand: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      stockOnHand(
        context.db,
        context.farm.id,
        expiryWindow(context.clock.now(), context.farm.expiryWarnDays),
        { now: context.clock.now(), feedDaysLow: context.farm.feedDaysLow }
      )
    ),

  /**
   * Everything that came into the store, newest first: what, how much — in maunds as well, for feed
   * weighed in kilos, because a trader's slip is in maunds — what it cost, who sold it, and when.
   */
  feedIn: protectedProcedure
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
        limit: FEED_IN_SHOWN,
      });
      const window = expiryWindow(
        context.clock.now(),
        context.farm.expiryWarnDays
      );
      const lines = await stockOnHand(context.db, context.farm.id, window);
      const prices = await purchasePricesIn(
        context.db,
        context.farm.id,
        input.feedItemId
      );
      const lotOf = new Map(
        lines.flatMap((line) =>
          line.lots.map((one) => [one.arrivalId, one] as const)
        )
      );
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
          /** What the seller's slip said, where the lot was weighed on the farm's scale: `quantity` is then what the
           *  scale showed. Nothing for a lot never weighed. */
          slipQuantity:
            row.slipQuantity === null ? null : Number(row.slipQuantity),
          /** The bags or maunds it was typed as, where it was; nothing for feed bought by its own unit. */
          pack: row.packKind
            ? { kind: row.packKind, count: Number(row.packCount) }
            : null,
          priceMoney: row.priceMoney,
          /** What a unit of it cost, and how far that moved on the last purchase of the same feed; nothing for a
           *  Harvest. */
          unitPriceMoney: prices.get(row.id)?.unitPriceMoney ?? null,
          priceChangePercent: prices.get(row.id)?.changePercent ?? null,
          sellerName: seller?.name ?? null,
          receivedOn: row.receivedOn,
          lotNumber: row.lotNumber,
          expiresOn: row.expiresOn,
          /** What is left of this delivery in the store; nothing once it is all fed out. */
          left: lotOf.get(row.id)?.left ?? 0,
          /** Where it stands against its day, by the farm's own warning. */
          standing:
            lotOf.get(row.id)?.standing ??
            expiryStanding(row.expiresOn, window),
          recordedAt: row.recordedAt,
        };
      });
    }),

  /**
   * How short each seller has run on the farm's scale over the last 90 days, from the lots weighed as they came: kilos,
   * percent of the slips, and taka at what each slip kilo was charged. A lot never weighed claims nothing.
   */
  onTheScale: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      scaleBySeller(context.db, context.farm.id, context.clock.now())
    ),

  /**
   * The last Feed Purchase of a feed — what a unit cost, and when — for the receiving sheet to set the lorry at the gate
   * beside before it is saved. Nothing for a feed never bought.
   */
  lastPurchase: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ feedItemId: z.string() }))
    .handler(({ context, input }) =>
      lastPurchaseOf(context.db, context.farm.id, input.feedItemId)
    ),

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
        /** How much, in the feed's own unit — or, for feed counted in kilos, the bags or maunds it came as. */
        quantity: quantityInput.optional(),
        pack: z
          .object({
            kind: z.enum(FEED_PACKS),
            count: z.number().positive().max(100_000),
          })
          .optional(),
        priceMoney: feedPriceInput.optional(),
        seller: sellerInput.optional(),
        /** What the farm's scale showed, in kilos, where the lot was weighed as it came: then what the store holds,
         *  and the slip's figure is kept beside it. */
        weighed: quantityInput.optional(),
        receivedOn: farmDay,
        /** How the seller was paid, for a purchase. */
        paymentMethod: paymentMethodInput,
        /** Which Farm Account mobile money or bank money went into or came out of. */
        farmAccountId: farmAccountIdInput,
        /** Its transaction ID, or the cheque's or slip's number. */
        reference: referenceInput,
        ...lotFields,
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
        priced: input.priceMoney !== undefined,
        seller: input.seller !== undefined,
      });
      const receivedOn = receivedDay(input.receivedOn, now);
      assertNotExpiredWhenBought(input.expiresOn, input.receivedOn);
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
        columns: {
          id: true,
          nameBn: true,
          retiredAt: true,
          fodderPriceMoney: true,
          unit: true,
          bagSizeKg: true,
        },
      });
      if (!item) {
        throw new ORPCError("NOT_FOUND", { message: "No such feed" });
      }
      if (item.retiredAt) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That feed is retired; restore it before buying more",
          data: { refusal: "feed_retired", feed: item.nameBn },
        });
      }
      const slip = quantityReceived(input, item);
      const weighed = weighedOnArrival(input, item);
      const quantity = weighed ?? slip;
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
            quantity: quantity.toFixed(1),
            slipQuantity: weighed === null ? null : slip.toFixed(1),
            packKind: input.pack?.kind ?? null,
            packCount: input.pack ? String(input.pack.count) : null,
            // A purchase is worth what the farm paid; a Harvest is worth what the farm says its own
            // fodder is worth, taken from the Feed Item rather than typed by whoever cut it.
            priceMoney:
              input.kind === "harvest"
                ? fodderValueOf(item, quantity)
                : (input.priceMoney ?? null),
            counterpartyId: sellerId,
            receivedOn,
            lotNumber: input.lotNumber ?? null,
            expiresOn: input.expiresOn ?? null,
            recordedBy: context.actor.id,
            recordedByRole,
            recordedAt: now,
          });
          await bookPurchaseMoney(
            tx,
            bookingOf(
              context,
              recordedByRole,
              now,
              accountSaid(["feed_in"], input)
            ),
            id,
            input.paymentMethod
          );
          await tellIfTheFeedCameDearer(tx, context.farm, id, now);
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
