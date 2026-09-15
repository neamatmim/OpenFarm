import { eq } from "@OpenFarm/db/operators";
import { dispatch } from "@OpenFarm/db/schema/milk";
import { z } from "zod";

import type { Tx } from "../audit";
import {
  assertNotLater,
  bookDispatchMoney,
  buyerInput,
  buyerOnTheDay,
  dispatchFields,
  readDispatch,
  twoPlaces,
} from "../dispatch-store";
import { bookingOf, paymentMethodOf } from "../money-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, paymentMethodChange } from "./correction";

const loadDispatch = (tx: Tx, farmId: string, id: string) =>
  tx.query.dispatch.findFirst({ where: { id, farmId } });

/** A figure the record keeps as text, as a screen shows it. */
const figureOf = (value: string | null) =>
  value === null ? null : Number(value);

/**
 * What a Dispatch's Correction may change: the litres, the time, the buyer, the challan, the price, the fat or SNF, the
 * note, and how it was paid. A challan, a note, a fat or an SNF set to nothing is cleared: a figure written against the
 * wrong lorry is put right by taking it away.
 */
export const dispatchCorrectionInput = correctionInput({
  dispatchedAt: changeOf(dispatchFields.dispatchedAt, z.coerce.date()),
  litres: changeOf(dispatchFields.litres, z.number()),
  buyer: changeOf(buyerInput, z.string()),
  challan: changeOf(dispatchFields.challan.nullable(), z.string().nullable()),
  pricePerLitreBdt: changeOf(dispatchFields.pricePerLitreBdt, z.number()),
  fatPercent: changeOf(
    dispatchFields.fatPercent.nullable(),
    z.number().nullable()
  ),
  snfPercent: changeOf(
    dispatchFields.snfPercent.nullable(),
    z.number().nullable()
  ),
  note: changeOf(dispatchFields.note.nullable(), z.string().nullable()),
  paymentMethod: paymentMethodChange,
});

/** A Dispatch put right — and with it the Money Event, rather than a second one. */
export const dispatchCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadDispatch>>>,
  z.infer<typeof dispatchCorrectionInput>["changes"]
> = {
  entity: "dispatch",
  table: dispatch,
  roles: ["owner", "manager"],
  missing: "No such dispatch",
  load: loadDispatch,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    dispatchedAt: row.dispatchedAt,
    litres: Number(row.litres),
    buyer: row.buyerName,
    challan: row.challan,
    pricePerLitreBdt: Number(row.pricePerLitreBdt),
    fatPercent: figureOf(row.fatPercent),
    snfPercent: figureOf(row.snfPercent),
    note: row.note,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "dispatch", row.id),
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readDispatch(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    if (to.dispatchedAt !== undefined) {
      assertNotLater(to.dispatchedAt, now);
    }
    await tx
      .update(dispatch)
      .set({
        ...(to.dispatchedAt === undefined
          ? {}
          : { dispatchedAt: to.dispatchedAt }),
        ...(to.litres === undefined ? {} : { litres: to.litres.toFixed(2) }),
        ...(to.challan === undefined ? {} : { challan: to.challan }),
        ...(to.pricePerLitreBdt === undefined
          ? {}
          : { pricePerLitreBdt: to.pricePerLitreBdt.toFixed(2) }),
        ...(to.fatPercent === undefined
          ? {}
          : { fatPercent: twoPlaces(to.fatPercent) }),
        ...(to.snfPercent === undefined
          ? {}
          : { snfPercent: twoPlaces(to.snfPercent) }),
        ...(to.note === undefined ? {} : { note: to.note }),
        ...(to.buyer === undefined
          ? {}
          : await buyerOnTheDay(tx, row.farmId, to.buyer, now)),
      })
      .where(eq(dispatch.id, row.id));
    await bookDispatchMoney(
      tx,
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
    return [];
  },
};
