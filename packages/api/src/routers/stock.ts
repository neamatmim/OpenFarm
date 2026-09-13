import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { FEED_IN_KINDS, feedIn } from "@OpenFarm/db/schema/feed";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { mayCorrect, maundsOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  correctedPaymentMethodInput,
  paymentMethodInput,
} from "../money-inputs";
import type { Booking } from "../money-store";
import { bookMoney, bookingOf, moneySnapshotOf } from "../money-store";
import { requireRole } from "../roles";
import { adjustmentsOf, stockOnHand } from "../stock-store";

const sellerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** A tenth of the Feed Item's unit is the smallest amount the store keeps. */
const quantityInput = z.number().min(0.1).max(1_000_000);
const priceInput = z.number().positive().max(100_000_000);

/** What came in, as the trail records it either side of a change. */
const readArrival = async (tx: Tx, id: string) => {
  const row = await tx.query.feedIn.findFirst({ where: { id } });
  return row
    ? { ...row, money: await moneySnapshotOf(tx, row.farmId, "feed_in", id) }
    : null;
};

/** Books a feed Purchase's money as it now stands. A harvest from the farm's own fields is feed and not
 *  money, and books nothing. */
const bookPurchaseMoney = async (
  tx: Tx,
  booking: Booking,
  id: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.feedIn.findFirst({ where: { id } });
  if (row?.priceBdt) {
    await bookMoney(tx, booking, {
      source: "feed_in",
      sourceId: row.id,
      amountBdt: Number(row.priceBdt),
      occurredAt: row.receivedOn,
      counterpartyId: row.counterpartyId,
      paymentMethod,
    });
  }
};

/**
 * A Purchase names what the lot cost and the seller it came from; a Harvest from the farm's own
 * fields names neither. One without the other's pieces is refused rather than guessed at: a purchase
 * nobody could account for, or money that never changed hands.
 */
const assertShapeOf = (arrival: {
  kind: (typeof FEED_IN_KINDS)[number];
  priced: boolean;
  seller: boolean;
}) => {
  if (arrival.kind === "purchase" && !(arrival.priced && arrival.seller)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A purchase names what it cost and who sold it",
      data: { refusal: "purchase_needs_price_and_seller" },
    });
  }
  if (arrival.kind === "harvest" && (arrival.priced || arrival.seller)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A harvest comes from the farm's own fields, at no price",
      data: { refusal: "harvest_has_no_price" },
    });
  }
};

/** The farm day feed came in, refused when that day has not come yet. */
const receivedDay = (day: string, now: Date): Date => {
  const receivedOn = startOfFarmDay(day);
  if (receivedOn > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Feed cannot have come in on a day that has not come yet",
      data: { refusal: "received_in_the_future" },
    });
  }
  return receivedOn;
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
          priceBdt: row.priceBdt === null ? null : Number(row.priceBdt),
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
   * The Manager's to record. Carries the id the screen made for this entry, so a second tap on the
   * same form is the same arrival and not a second lorry. A retired Feed Item takes nothing in: it is
   * kept for what it was fed, not for buying more of.
   */
  receive: protectedProcedure
    .use(requireRole("manager"))
    .input(
      z.object({
        id: z.string().uuid().optional(),
        feedItemId: z.string(),
        kind: z.enum(FEED_IN_KINDS),
        quantity: quantityInput,
        priceBdt: priceInput.optional(),
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
        columns: { id: true, retiredAt: true },
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
          after: (tx) => readArrival(tx, id),
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
            priceBdt: input.priceBdt?.toFixed(2) ?? null,
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
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string(),
        quantity: quantityInput.optional(),
        priceBdt: priceInput.optional(),
        seller: sellerInput.optional(),
        receivedOn: farmDay.optional(),
        paymentMethod: correctedPaymentMethodInput,
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.feedIn.findFirst({
        where: { id: input.id, farmId: context.farm.id },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such arrival" });
      }
      const verdict = mayCorrect({
        roles: context.roles,
        isOwnEntry: existing.recordedBy === context.actor.id,
        recordedAt: existing.recordedAt,
        now,
        windows: correctionWindows(context.farm),
      });
      if (!verdict.allowed) {
        throw new ORPCError("FORBIDDEN", {
          message: "The correction window for that entry has closed",
          data: { refusal: refusalData(verdict.refusal) },
        });
      }
      assertShapeOf({
        kind: existing.kind,
        priced: (input.priceBdt ?? existing.priceBdt) !== null,
        seller: input.seller !== undefined || existing.counterpartyId !== null,
      });
      const receivedOn = input.receivedOn
        ? receivedDay(input.receivedOn, now)
        : undefined;
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "feed_in",
        existing.id
      );
      await audit.write(
        {
          entity: "feed_in",
          entityId: existing.id,
          action: "correct",
          reason: input.reason,
          roleUsed: verdict.role,
          supersedesId: previous?.id,
          before: (tx) => readArrival(tx, existing.id),
          after: (tx) => readArrival(tx, existing.id),
        },
        async (tx) => {
          await tx
            .update(feedIn)
            .set({
              ...(input.quantity
                ? { quantity: input.quantity.toFixed(1) }
                : {}),
              ...(input.priceBdt
                ? { priceBdt: input.priceBdt.toFixed(2) }
                : {}),
              ...(receivedOn ? { receivedOn } : {}),
              ...(input.seller
                ? {
                    counterpartyId: await counterpartyNamed(
                      tx,
                      context.farm.id,
                      input.seller,
                      now
                    ),
                  }
                : {}),
            })
            .where(eq(feedIn.id, existing.id));
          await bookPurchaseMoney(
            tx,
            bookingOf(context, verdict.role, now),
            existing.id,
            input.paymentMethod
          );
        }
      );
      return { id: existing.id };
    }),
};
