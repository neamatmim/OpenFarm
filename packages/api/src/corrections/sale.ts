import { eq } from "@OpenFarm/db/operators";
import { sale } from "@OpenFarm/db/schema/fattening";
import { bakiPutRight, farmDayOf, paidAtTheGate } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "../audit";
import { bakiOrRefuse, paidNowInput, promisedByInput } from "../baki-store";
import { counterpartyNamed } from "../counterparty-store";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import {
  bookSaleMoney,
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
      priceBdt: true,
      bakiBdt: true,
      promisedBy: true,
      soldAt: true,
      recordedBy: true,
      createdAt: true,
    },
    with: { buyer: { columns: { name: true } } },
  });

/** What a Sale's Correction may change: what she fetched, who bought her, how he paid, what he paid there and then,
 *  and the day he promised to pay the rest by. */
export const saleCorrectionInput = correctionInput({
  priceBdt: changeOf(salePriceInput, z.number()),
  buyer: changeOf(buyerInput, z.string()),
  paymentMethod: paymentMethodChange,
  paidNowBdt: changeOf(paidNowInput, z.number()),
  promisedBy: changeOf(promisedByInput.nullable(), z.string().nullable()),
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
    priceBdt: row.priceBdt,
    buyer: row.buyer.name,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "sale", row.id),
    paidNowBdt: paidAtTheGate(row.priceBdt, row.bakiBdt),
    promisedBy: row.promisedBy,
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readSale(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    // What he paid stands unless the Correction says otherwise: a price mistyped is not cash handed back.
    const baki = bakiOrRefuse(
      bakiPutRight({
        before: {
          worthBdt: row.priceBdt,
          bakiBdt: row.bakiBdt,
          promisedBy: row.promisedBy,
        },
        worthBdt: to.priceBdt ?? row.priceBdt,
        paidNowBdt: to.paidNowBdt,
        promisedBy: to.promisedBy,
        leftOn: farmDayOf(row.soldAt),
        promiseRequired: true,
      })
    );
    const bakiMoved =
      baki.bakiBdt !== row.bakiBdt || baki.promisedBy !== row.promisedBy;
    const putRight = {
      ...(to.priceBdt === undefined ? {} : { priceBdt: to.priceBdt }),
      ...(bakiMoved ? baki : {}),
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
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
  },
};
