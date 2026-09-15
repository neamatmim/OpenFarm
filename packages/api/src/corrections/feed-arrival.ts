import { eq } from "@OpenFarm/db/operators";
import { feedIn } from "@OpenFarm/db/schema/feed";
import { farmDayOf } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import {
  assertShapeOf,
  bookPurchaseMoney,
  feedPriceInput,
  quantityInput,
  readFeedArrival,
  receivedDay,
  sellerInput,
} from "../stock-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const loadArrival = (tx: Tx, farmId: string, id: string) =>
  tx.query.feedIn.findFirst({
    where: { id, farmId },
    with: { seller: { columns: { name: true } } },
  });

/** What putting right feed that came in may change: how much, what it cost, who sold it, the day, and how it was paid. */
export const feedArrivalCorrectionInput = correctionInput({
  quantity: changeOf(quantityInput, z.number()),
  priceBdt: changeOf(feedPriceInput, z.number().nullable()),
  seller: changeOf(sellerInput, z.string().nullable()),
  receivedOn: changeOf(farmDay, z.string()),
  paymentMethod: paymentMethodChange,
});

/**
 * Feed that came in, put right — and with it the Money Event of a Purchase — because 5000 kg typed for 500 would
 * otherwise sit in the store, and in its price, for good.
 */
export const feedArrivalCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadArrival>>>,
  z.infer<typeof feedArrivalCorrectionInput>["changes"]
> = {
  entity: "feed_in",
  table: feedIn,
  roles: ["owner", "manager"],
  missing: "No such arrival",
  load: loadArrival,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    quantity: Number(row.quantity),
    priceBdt: row.priceBdt === null ? null : Number(row.priceBdt),
    seller: row.seller?.name ?? null,
    receivedOn: farmDayOf(row.receivedOn),
    paymentMethod: await paymentMethodOf(tx, row.farmId, "feed_in", row.id),
  }),
  shownAs: { seller: (to) => to.name },
  trail: (tx, row) => readFeedArrival(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    assertShapeOf({
      kind: row.kind,
      priced: (to.priceBdt ?? row.priceBdt) !== null,
      seller: to.seller !== undefined || row.counterpartyId !== null,
    });
    await tx
      .update(feedIn)
      .set({
        ...(to.quantity === undefined
          ? {}
          : { quantity: to.quantity.toFixed(1) }),
        ...(to.priceBdt === undefined
          ? {}
          : { priceBdt: to.priceBdt.toFixed(2) }),
        ...(to.receivedOn === undefined
          ? {}
          : { receivedOn: receivedDay(to.receivedOn, now) }),
        ...(to.seller === undefined
          ? {}
          : {
              counterpartyId: await counterpartyNamed(
                tx,
                row.farmId,
                to.seller,
                now
              ),
            }),
      })
      .where(eq(feedIn.id, row.id));
    await bookPurchaseMoney(
      tx,
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
  },
};
