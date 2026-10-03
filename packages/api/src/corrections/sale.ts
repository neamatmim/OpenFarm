import { eq } from "@OpenFarm/db/operators";
import { sale } from "@OpenFarm/db/schema/fattening";
import { receivablePutRight, farmDayOf, paidAtTheGate } from "@OpenFarm/domain";
import { z } from "zod";

import {
  tellIfShrankTooMuch,
  tellIfSoldUnderCost,
} from "../animal-price-store";
import type { Tx } from "../audit";
import { assertTheHand, handOfTheRecord } from "../cash-store";
import { counterpartyNamed } from "../counterparty-store";
import { farmAccountChange, paymentMethodChange } from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  farmAccountShownOf,
  paymentMethodOf,
} from "../money-store";
import {
  receivableOrRefuse,
  paidNowInput,
  promisedByInput,
} from "../receivable-store";
import {
  bookSaleMoney,
  brokerInput,
  buyerInput,
  salePriceInput,
  readSale,
} from "../sale-store";
import { lockTheFarm } from "../venture-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadSale = (tx: Tx, farmId: string, id: string) =>
  tx.query.sale.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      priceMoney: true,
      receivableMoney: true,
      brokerMoney: true,
      promisedBy: true,
      weightKg: true,
      soldAt: true,
      recordedBy: true,
      createdAt: true,
    },
    with: { buyer: { columns: { name: true } } },
  });

/** What a Sale's Correction may change: what she fetched, what she weighed on the day, who bought her, how he paid,
 *  what he paid there and then, the day he promised to pay the rest by, and what the broker took. */
export const saleCorrectionInput = correctionInput({
  priceMoney: changeOf(salePriceInput, z.number()),
  buyer: changeOf(buyerInput, z.string()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account bKash or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
  paidNowMoney: changeOf(paidNowInput, z.number()),
  promisedBy: changeOf(promisedByInput.nullable(), z.string().nullable()),
  brokerMoney: changeOf(brokerInput, z.number()),
  weightKg: changeOf(z.number().positive().max(2000), z.number()),
  /** Whose hand took the cash, put right on the rule a Sale is written on (`assertTheHand`). */
  heldBy: changeOf(z.string(), z.string().nullable()),
});

/**
 * A Sale put right — and with it the Money Event, rather than a second one. She stays sold: the way she left is not
 * what is corrected.
 */
export const saleCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadSale>>>,
  z.infer<typeof saleCorrectionInput>["changes"]
> = {
  entity: "sale",
  table: sale,
  roles: ["owner", "manager"],
  // Putting one of these right can move a Venture Movement, so it takes the Farm lock first, as
  // everything that counts a Venture's money does.
  lock: lockTheFarm,
  // No `venturesOf`, on purpose. A Sale put right after a Settlement is the late news itself — refusing
  // it would leave what a buyer really paid nowhere to land — and what it changes is shown as a
  // Settlement Adjustment rather than moving the frozen figures.
  missing: "No such sale",
  load: loadSale,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    farmAccount: await farmAccountShownOf(tx, row.farmId, "sale", row.id),
    priceMoney: row.priceMoney,
    buyer: row.buyer.name,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "sale", row.id),
    paidNowMoney: paidAtTheGate(row.priceMoney, row.receivableMoney),
    promisedBy: row.promisedBy,
    brokerMoney: row.brokerMoney,
    weightKg: Number(row.weightKg),
    heldBy: await handOfTheRecord(tx, row.farmId, "sale", row.id),
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readSale(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    // What he paid stands unless the Correction says otherwise: a price mistyped is not cash handed back.
    const receivable = receivableOrRefuse(
      receivablePutRight({
        before: {
          worthMoney: row.priceMoney,
          receivableMoney: row.receivableMoney,
          promisedBy: row.promisedBy,
        },
        worthMoney: to.priceMoney ?? row.priceMoney,
        paidNowMoney: to.paidNowMoney,
        promisedBy: to.promisedBy,
        leftOn: farmDayOf(row.soldAt),
        promiseRequired: true,
      })
    );
    const receivableMoved =
      receivable.receivableMoney !== row.receivableMoney ||
      receivable.promisedBy !== row.promisedBy;
    const putRight = {
      ...(to.priceMoney === undefined ? {} : { priceMoney: to.priceMoney }),
      ...(to.brokerMoney === undefined ? {} : { brokerMoney: to.brokerMoney }),
      ...(to.weightKg === undefined
        ? {}
        : { weightKg: to.weightKg.toFixed(2) }),
      ...(receivableMoved ? receivable : {}),
      ...(to.buyer === undefined
        ? {}
        : {
            counterpartyId: await counterpartyNamed(
              tx,
              row.farmId,
              to.buyer,
              now
            ),
          }),
    };
    // Nothing of the record itself may have changed: a Correction may name only how it was paid
    // for, and an update with no values to set is a database error rather than a no-op.
    if (somethingChanged(putRight)) {
      await tx.update(sale).set(putRight).where(eq(sale.id, row.id));
    }
    await bookSaleMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount ? accountSaid(["sale"], to.farmAccount) : undefined
      ),
      row.id,
      to.paymentMethod,
      await assertTheHand(
        tx,
        row.farmId,
        { id: context.actor.id, roles: context.roles },
        to.heldBy
      )
    );
    // A price, a broker's fee or her weight put right may take her under her cost or the market; told once about the
    // Sale, as when it was made.
    const worthMoved =
      to.priceMoney !== undefined ||
      to.brokerMoney !== undefined ||
      to.weightKg !== undefined;
    if (worthMoved) {
      await tellIfSoldUnderCost(tx, row.farmId, row.id, now);
      await tellIfShrankTooMuch(tx, row.farmId, row.id, now);
    }
  },
};
