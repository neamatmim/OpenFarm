import { eq } from "@OpenFarm/db/operators";
import { sale } from "@OpenFarm/db/schema/fattening";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import {
  bookSaleMoney,
  buyerInput,
  salePriceInput,
  readSale,
} from "../sale-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const loadSale = (tx: Tx, farmId: string, id: string) =>
  tx.query.sale.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      priceBdt: true,
      recordedBy: true,
      createdAt: true,
    },
    with: { buyer: { columns: { name: true } } },
  });

/** What a Sale's Correction may change: what she fetched, who bought her, and how he paid. */
export const saleCorrectionInput = correctionInput({
  priceBdt: changeOf(salePriceInput, z.number()),
  buyer: changeOf(buyerInput, z.string()),
  paymentMethod: paymentMethodChange,
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
  missing: "No such sale",
  load: loadSale,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    priceBdt: Number(row.priceBdt),
    buyer: row.buyer.name,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "sale", row.id),
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readSale(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    await tx
      .update(sale)
      .set({
        ...(to.priceBdt === undefined
          ? {}
          : { priceBdt: to.priceBdt.toFixed(2) }),
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
      })
      .where(eq(sale.id, row.id));
    await bookSaleMoney(
      tx,
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
  },
};
