import { eq } from "@OpenFarm/db/operators";
import { dispatch } from "@OpenFarm/db/schema/milk";
import { receivablePutRight, farmDayOf, paidAtTheGate } from "@OpenFarm/domain";
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
  worthOfDispatch,
} from "../dispatch-store";
import { farmAccountChange, paymentMethodChange } from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  farmAccountShownOf,
  paymentMethodOf,
} from "../money-store";
import {
  assertOwedCoversWrittenOff,
  receivableOrRefuse,
  paidNowInput,
  promisedByInput,
} from "../receivable-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadDispatch = (tx: Tx, farmId: string, id: string) =>
  tx.query.dispatch.findFirst({ where: { id, farmId } });

/** A figure the record keeps as text, as a screen shows it. */
const figureOf = (value: string | null) =>
  value === null ? null : Number(value);

/**
 * What a Dispatch's Correction may change: the litres, the time, the buyer, the delivery note, the price, the fat or SNF, the
 * note, how it was paid, what the buyer paid there and then, and the day he promised to pay the rest by. A delivery note, a
 * note, a fat, an SNF or a promise set to nothing is cleared: a figure written against the wrong lorry is put right by
 * taking it away.
 */
export const dispatchCorrectionInput = correctionInput({
  dispatchedAt: changeOf(dispatchFields.dispatchedAt, z.coerce.date()),
  litres: changeOf(dispatchFields.litres, z.number()),
  buyer: changeOf(buyerInput, z.string()),
  deliveryNote: changeOf(
    dispatchFields.deliveryNote.nullable(),
    z.string().nullable()
  ),
  pricePerLitreMoney: changeOf(dispatchFields.pricePerLitreMoney, z.number()),
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
  /** Which Farm Account mobile money or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
  paidNowMoney: changeOf(paidNowInput, z.number()),
  promisedBy: changeOf(promisedByInput.nullable(), z.string().nullable()),
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
    farmAccount: await farmAccountShownOf(tx, row.farmId, "dispatch", row.id),
    dispatchedAt: row.dispatchedAt,
    litres: Number(row.litres),
    buyer: row.buyerName,
    deliveryNote: row.deliveryNote,
    pricePerLitreMoney: Number(row.pricePerLitreMoney),
    fatPercent: figureOf(row.fatPercent),
    snfPercent: figureOf(row.snfPercent),
    note: row.note,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "dispatch", row.id),
    paidNowMoney: paidAtTheGate(worthOfDispatch(row), row.receivableMoney),
    promisedBy: row.promisedBy,
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readDispatch(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    if (to.dispatchedAt !== undefined) {
      assertNotLater(to.dispatchedAt, now);
    }
    // What he paid stands unless the Correction says otherwise: litres or a price mistyped is not cash handed back.
    const receivable = receivableOrRefuse(
      receivablePutRight({
        before: {
          worthMoney: worthOfDispatch(row),
          receivableMoney: row.receivableMoney,
          promisedBy: row.promisedBy,
        },
        worthMoney: worthOfDispatch({
          litres: to.litres ?? row.litres,
          pricePerLitreMoney: to.pricePerLitreMoney ?? row.pricePerLitreMoney,
        }),
        paidNowMoney: to.paidNowMoney,
        promisedBy: to.promisedBy,
        leftOn: farmDayOf(to.dispatchedAt ?? row.dispatchedAt),
        promiseRequired: false,
      })
    );
    const receivableMoved =
      receivable.receivableMoney !== row.receivableMoney ||
      receivable.promisedBy !== row.promisedBy;
    if (receivable.receivableMoney < row.receivableMoney) {
      await assertOwedCoversWrittenOff(
        tx,
        "dispatch",
        row.id,
        receivable.receivableMoney
      );
    }
    const putRight = {
      ...(receivableMoved ? receivable : {}),
      ...(to.dispatchedAt === undefined
        ? {}
        : { dispatchedAt: to.dispatchedAt }),
      ...(to.litres === undefined ? {} : { litres: to.litres.toFixed(2) }),
      ...(to.deliveryNote === undefined
        ? {}
        : { deliveryNote: to.deliveryNote }),
      ...(to.pricePerLitreMoney === undefined
        ? {}
        : { pricePerLitreMoney: to.pricePerLitreMoney.toFixed(2) }),
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
    };
    // Nothing of the record itself may have changed: a Correction may name only how it was paid
    // for, and an update with no values to set is a database error rather than a no-op.
    if (somethingChanged(putRight)) {
      await tx.update(dispatch).set(putRight).where(eq(dispatch.id, row.id));
    }
    await bookDispatchMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount ? accountSaid(["dispatch"], to.farmAccount) : undefined
      ),
      row.id,
      to.paymentMethod
    );
  },
};
