import { eq } from "@OpenFarm/db/operators";
import { medicinePurchase } from "@OpenFarm/db/schema/money";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { assertNotExpiredWhenBought } from "../lot-input";
import {
  amountInput,
  farmAccountChange,
  paymentMethodChange,
} from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  bookMoney,
  farmAccountShownOf,
  moneySnapshotOf,
  paymentMethodOf,
} from "../money-store";
import { sellerInput } from "../stock-store";
import type { CorrectionKind } from "./correction";
import {
  changeOf,
  correctionInput,
  somethingChanged,
  venturesCharged,
} from "./correction";

const loadPurchase = (tx: Tx, farmId: string, id: string) =>
  tx.query.medicinePurchase.findFirst({
    where: { id, farmId },
    with: { seller: { columns: { name: true } } },
  });

/** A Medicine Purchase as the trail records it either side of a change, with its money. */
const readPurchase = async (tx: Tx, id: string) => {
  const row = await tx.query.medicinePurchase.findFirst({ where: { id } });
  return row
    ? {
        ...row,
        money: await moneySnapshotOf(tx, row.farmId, "medicine_purchase", id),
      }
    : null;
};

/** What putting right medicine bought may change: how many doses, what was written of the box, what it cost, who sold
 *  it, the day, its Lot, and how it was paid. */
export const medicinePurchaseCorrectionInput = correctionInput({
  doses: changeOf(z.number().int().positive().max(100_000), z.number()),
  quantity: changeOf(z.string().trim().min(1).max(60), z.string()),
  priceMoney: changeOf(amountInput, z.number()),
  seller: changeOf(sellerInput, z.string().nullable()),
  purchasedOn: changeOf(farmDay, z.string()),
  lotNumber: changeOf(
    z.string().trim().min(1).max(60).nullable(),
    z.string().nullable()
  ),
  expiresOn: changeOf(farmDay.nullable(), z.string().nullable()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account mobile money or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
});

/**
 * Medicine bought, put right — and with it the Money Event of the purchase (CONTEXT: Medicine Purchase). Without it a
 * typo — 100 doses for 10, ৳10,000 for ৳1,000 — sat for good in the store, its Lots, every later dose's cost and the
 * count's money.
 */
export const medicinePurchaseCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadPurchase>>>,
  z.infer<typeof medicinePurchaseCorrectionInput>["changes"]
> = {
  entity: "medicine_purchase",
  table: medicinePurchase,
  roles: ["owner", "manager"],
  /**
   * A dose is costed from the latest purchases on or before it (`dosePriceOf`), so putting a purchase right re-prices
   * the doses of that product given since — counting from the earlier of its day and the day it would move to — of
   * any Venture whose animal had one.
   */
  venturesOf: (tx, row, changes) => {
    const moved = changes.purchasedOn && startOfFarmDay(changes.purchasedOn.to);
    const from = moved && moved < row.purchasedOn ? moved : row.purchasedOn;
    return venturesCharged(tx, row.farmId, (costs) =>
      costs.charges.filter(
        (one) =>
          one.kind === "dose" &&
          one.fromId === row.drugProductId &&
          one.at >= from
      )
    );
  },
  missing: "No such purchase",
  load: loadPurchase,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    farmAccount: await farmAccountShownOf(
      tx,
      row.farmId,
      "medicine_purchase",
      row.id
    ),
    doses: row.doses,
    quantity: row.quantity,
    priceMoney: row.priceMoney,
    seller: row.seller?.name ?? null,
    purchasedOn: farmDayOf(row.purchasedOn),
    lotNumber: row.lotNumber,
    expiresOn: row.expiresOn,
    paymentMethod: await paymentMethodOf(
      tx,
      row.farmId,
      "medicine_purchase",
      row.id
    ),
  }),
  shownAs: { seller: (to) => to.name },
  trail: (tx, row) => readPurchase(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    const purchasedOn = to.purchasedOn ?? farmDayOf(row.purchasedOn);
    if (startOfFarmDay(purchasedOn) > now) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Medicine cannot have been bought on a day that has not come yet",
        data: { refusal: "bought_in_the_future" },
      });
    }
    const expiresOn = to.expiresOn === undefined ? row.expiresOn : to.expiresOn;
    assertNotExpiredWhenBought(expiresOn ?? undefined, purchasedOn);
    const sellerId =
      to.seller === undefined
        ? row.counterpartyId
        : await counterpartyNamed(tx, row.farmId, to.seller, now);
    const putRight = {
      ...(to.doses === undefined ? {} : { doses: to.doses }),
      ...(to.quantity === undefined ? {} : { quantity: to.quantity }),
      ...(to.priceMoney === undefined ? {} : { priceMoney: to.priceMoney }),
      ...(to.seller === undefined ? {} : { counterpartyId: sellerId }),
      ...(to.purchasedOn === undefined
        ? {}
        : { purchasedOn: startOfFarmDay(to.purchasedOn) }),
      ...(to.lotNumber === undefined ? {} : { lotNumber: to.lotNumber }),
      ...(to.expiresOn === undefined ? {} : { expiresOn: to.expiresOn }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(medicinePurchase)
        .set(putRight)
        .where(eq(medicinePurchase.id, row.id));
    }
    // The Money Event says what the purchase now says: its amount, its day, its seller and how it was paid.
    await bookMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount
          ? accountSaid(["medicine_purchase"], to.farmAccount)
          : undefined
      ),
      {
        source: "medicine_purchase",
        sourceId: row.id,
        amountMoney: to.priceMoney ?? row.priceMoney,
        occurredAt: startOfFarmDay(purchasedOn),
        counterpartyId: sellerId,
        paymentMethod: to.paymentMethod,
      }
    );
  },
};
