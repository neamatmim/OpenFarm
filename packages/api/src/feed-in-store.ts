import { feedIn } from "@OpenFarm/db/schema/feed";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import type { FeedPack } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";
import {
  lockFeedOrder,
  validateOrderedDelivery,
} from "./feed-purchasing-store";
import { accountSaid, bookingOf } from "./money-store";
import {
  bookPurchaseMoney,
  fodderValueOf,
  readFeedArrival,
  tellIfTheFeedCameDearer,
} from "./stock-store";
import {
  deliveryInvoice,
  lockSupplierFarm,
  supplierNamed,
  verifyDeliveryInvoice,
} from "./supplier-store";
import { seenWhenDone } from "./writes-seen";

/** Who records feed coming in, on which farm, under which Role. */
type Recording = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/** Feed coming in as the form said it, the checks that need no lock already passed. */
export interface FeedInSaid {
  /** The Feed In's id: the phone's, so a second tap of the same lot is the same lot. */
  id: string;
  input: {
    kind: "purchase" | "harvest";
    feedItemId: string;
    purchaseOrderId?: string;
    seller?: { name: string; address?: string; phone?: string };
    supplierId?: string;
    invoice?: { number: string; invoicedOn: string; dueOn: string };
    priceMoney?: number;
    paidAtDeliveryMoney?: number;
    pack?: { kind: FeedPack; count: number };
    receivedOn: string;
    paymentMethod: PaymentMethod;
    farmAccountId?: string;
    reference?: string;
    lotNumber?: string;
    expiresOn?: string;
  };
  item: {
    id: string;
    fodderPriceMoney: number | null;
  };
  /** What the store now holds of it: the scale's kilos where it was weighed, the slip's otherwise. */
  quantity: number;
  /** The slip's figure, in the feed's own unit. */
  slip: number;
  /** What the farm's scale showed, or null where nobody weighed it. */
  weighed: number | null;
  receivedOn: Date;
  recordedByRole: NonNullable<Context["roleUsed"]>;
  now: Date;
}

/**
 * Feed In written behind the supplier's and the order's locks: refused where it would overrun its order, counted once
 * however often the same lot arrives, its invoice and money booked with it, and the Owner told if it came dearer.
 */
export const recordFeedIn = async (
  context: Recording,
  {
    id,
    input,
    item,
    quantity,
    slip,
    weighed,
    receivedOn,
    recordedByRole,
    now,
  }: FeedInSaid
) => {
  await seenWhenDone(
    context.db.transaction(async (tx) => {
      await lockSupplierFarm(tx, context.farm.id);
      const order = input.purchaseOrderId
        ? await lockFeedOrder(tx, context.farm.id, input.purchaseOrderId)
        : null;
      // Another tap may have waited behind this order's delivery lock.
      const existing = await tx.query.feedIn.findFirst({
        where: { id, farmId: context.farm.id },
      });
      if (existing) {
        if ((existing.purchaseOrderId ?? undefined) !== input.purchaseOrderId) {
          throw new ORPCError("CONFLICT", {
            data: { refusal: "feed_order_changed" },
          });
        }
        return;
      }
      const sellerId = input.seller
        ? await supplierNamed(
            tx,
            context.farm.id,
            input.seller,
            now,
            input.supplierId
          )
        : null;
      if (order) {
        await validateOrderedDelivery(
          tx,
          order,
          { ...input, quantity: Number(quantity.toFixed(1)) },
          sellerId
        );
      }
      const funding = await deliveryInvoice(tx, context, input, sellerId, now);
      await tx.insert(feedIn).values({
        id,
        farmId: context.farm.id,
        feedItemId: item.id,
        kind: input.kind,
        purchaseOrderId: order?.id ?? null,
        ...funding,
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
      await verifyDeliveryInvoice(
        tx,
        context.farm.id,
        funding.supplierInvoiceId
      );
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
      await audited(context).recordEvent(tx, {
        entity: "feed_in",
        entityId: id,
        action: "create",
        after: await readFeedArrival(tx, id),
      });
    })
  );
};
