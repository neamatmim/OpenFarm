import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { FEED_PACKS, RECEIVED_FEED_IN_KINDS } from "@OpenFarm/db/schema/feed";
import type { FeedPack, FeedUnit } from "@OpenFarm/domain";
import {
  FEED_IN_SHOWN,
  madeUnitPriceOf,
  maundsOf,
  quantityOfPacks,
} from "@OpenFarm/domain";
import { FEED_ESTIMATE_BASES } from "@OpenFarm/domain/feed-estimate";
import { expiryStanding, expiryWindow } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { correct } from "../corrections/correction";
import {
  feedArrivalCorrection,
  feedArrivalCorrectionInput,
} from "../corrections/feed-arrival";
import { farmDay } from "../farm-clock";
import { monthlyFeedEstimate } from "../feed-estimate-store";
import { recordFeedIn } from "../feed-in-store";
import { protectedProcedure } from "../index";
import { assertNotExpiredWhenBought, lotFields } from "../lot-input";
import type { LoadedMaking } from "../making-shape";
import { MAKING_WITH, inputsSaid } from "../making-shape";
import {
  farmAccountIdInput,
  monthInput,
  paymentMethodInput,
  referenceInput,
} from "../money-inputs";
import { requireRole } from "../roles";
import {
  assertShapeOf,
  feedPriceInput,
  quantityInput,
  receivedDay,
  sellerInput,
  adjustmentsOf,
  stockOnHand,
  feedStoreOf,
  lastPurchaseOf,
  purchasePricesIn,
  scaleBySeller,
} from "../stock-store";
import { supplierRefused } from "../supplier-store";

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
      data: { refusal: "say_how_much_came" },
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

/** The Feed Making a made Feed In came from, as the history lists it. */
type MadeBy = Pick<LoadedMaking, "id" | "inputs">;

/**
 * What a Feed In cost, and a unit of it: a Purchase what was paid, set beside the last Purchase of the same feed; a
 * Harvest its Fodder Price's worth; made feed what went into it, over what came out — worked out with the store, never
 * set beside a purchase, and nothing while something that went in has no price.
 */
const whatItCost = (
  row: { id: string; priceMoney: number | null },
  quantity: number,
  making: MadeBy | null,
  {
    prices,
    makings,
  }: {
    prices: ReadonlyMap<string, { unitPriceMoney: number }>;
    makings: ReadonlyMap<string, { worthMoney: number | null }>;
  }
): { priceMoney: number | null; unitPriceMoney: number | null } => {
  if (!making) {
    return {
      priceMoney: row.priceMoney,
      unitPriceMoney: prices.get(row.id)?.unitPriceMoney ?? null,
    };
  }
  const worth = makings.get(making.id)?.worthMoney ?? null;
  return {
    priceMoney: worth,
    unitPriceMoney: madeUnitPriceOf(worth, quantity),
  };
};

/** What went into made feed, as the history says it beneath; nothing for feed bought or cut. */
const madeFrom = (making: MadeBy | null) =>
  making ? { id: making.id, inputs: inputsSaid(making.inputs) } : null;

export const stockRouter = {
  /** Monthly buying quantities and cost estimates are for the people who keep the farm's store. */
  monthlyEstimate: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        month: monthInput,
        basis: z.enum(FEED_ESTIMATE_BASES).default("rations"),
      })
    )
    .handler(({ context, input }) =>
      monthlyFeedEstimate(
        context.db,
        context.farm,
        context.clock.now(),
        input.month,
        input.basis
      )
    ),
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
          feedItem: { columns: { nameBn: true, nameEn: true, unit: true } },
          seller: { columns: { name: true } },
          making: {
            columns: { id: true },
            with: { inputs: MAKING_WITH.inputs },
          },
        },
        orderBy: { receivedOn: "desc", id: "desc" },
        limit: FEED_IN_SHOWN,
      });
      const window = expiryWindow(
        context.clock.now(),
        context.farm.expiryWarnDays
      );
      const lines = await stockOnHand(context.db, context.farm.id, window);
      // Made feed is worth what went into it, worked out with the store rather than kept on the row.
      const { makings } = await feedStoreOf(context.db, context.farm.id);
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
      return rows.map(({ feedItem, seller, making, ...row }) => {
        const quantity = Number(row.quantity);
        return {
          id: row.id,
          feedItemId: row.feedItemId,
          nameBn: feedItem.nameBn,
          nameEn: feedItem.nameEn,
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
          ...whatItCost(row, quantity, making, {
            prices,
            makings,
          }),
          priceChangePercent: prices.get(row.id)?.changePercent ?? null,
          /** The Feed Making that made it, and what went into it; nothing for feed bought or cut. */
          making: madeFrom(making),
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
        purchaseOrderId: z.string().uuid().optional(),
        feedItemId: z.string(),
        // Bought or cut: made feed comes in only through the Feed Making that made it.
        kind: z.enum(RECEIVED_FEED_IN_KINDS),
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
        supplierId: z.string().optional(),
        invoice: z
          .object({
            number: z.string().trim().min(1).max(120),
            invoicedOn: farmDay,
            dueOn: farmDay,
          })
          .optional(),
        paidAtDeliveryMoney: z
          .number()
          .min(0)
          .max(100_000_000)
          .multipleOf(0.01)
          .optional(),
        /** What the farm's scale showed, in kilos, where the lot was weighed as it came: then what the store holds,
         *  and the slip's figure is kept beside it. */
        weighed: quantityInput.optional(),
        receivedOn: farmDay,
        /** How the seller was paid, for a purchase. */
        paymentMethod: paymentMethodInput,
        /** Which Farm Account mobile money or bank money went into or came out of. */
        farmAccountId: farmAccountIdInput,
        /** Its transaction ID, or the check's or slip's number. */
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
      if (
        (input.invoice || input.paidAtDeliveryMoney !== undefined) &&
        input.kind !== "purchase"
      ) {
        supplierRefused("supplier_invoice_purchase");
      }
      if (input.paidAtDeliveryMoney !== undefined && !input.invoice) {
        supplierRefused("supplier_invoice_required");
      }
      if ((input.paidAtDeliveryMoney ?? 0) > (input.priceMoney ?? 0)) {
        supplierRefused("supplier_payment_limit");
      }
      const receivedOn = receivedDay(input.receivedOn, now);
      assertNotExpiredWhenBought(input.expiresOn, input.receivedOn);
      const id = input.id ?? newId(now);
      const already = await context.db.query.feedIn.findFirst({
        where: { id, farmId: context.farm.id },
        columns: { id: true, purchaseOrderId: true },
      });
      if (already) {
        if ((already.purchaseOrderId ?? undefined) !== input.purchaseOrderId) {
          throw new ORPCError("CONFLICT", {
            data: { refusal: "feed_order_changed" },
          });
        }
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
      await recordFeedIn(context, {
        id,
        input,
        item,
        quantity,
        slip,
        weighed,
        receivedOn,
        recordedByRole,
        now,
      });
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
