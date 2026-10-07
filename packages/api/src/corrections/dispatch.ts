import { eq } from "@OpenFarm/db/operators";
import { dispatch } from "@OpenFarm/db/schema/milk";
import { receivablePutRight, farmDayOf, paidAtTheGate } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { clearDebtNoticesOf, clearNoticesAbout } from "../alerts-store";
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
  forgetTheMoneyOf,
  paymentMethodOf,
} from "../money-store";
import {
  assertNothingStandsAgainst,
  assertOwedCoversPaid,
  assertOwedCoversWrittenOff,
  receivableOrRefuse,
  paidNowInput,
  promisedByInput,
} from "../receivable-store";
import type { CorrectionKind, Corrector, NewValues } from "./correction";
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
  /** Entered twice, or the lorry never came: taken off the books with its money and what the buyer was said to owe for
   *  it, by whoever may correct it in their window, the Owner at any time (the Owner, 2026-10-07) — refused while he
   *  has paid against it, or it was written off. */
  voided: changeOf(z.literal(true), z.boolean()),
});

/** A Dispatch taken back with its money. A buyer who paid against it, or a debt written off on it, stands on it: those
 *  are put right first. */
const voidTheDispatch = async (
  tx: Tx,
  row: { id: string; farmId: string; buyerId: string },
  now: Date
) => {
  await assertNothingStandsAgainst(tx, row.farmId, {
    id: row.id,
    counterpartyId: row.buyerId,
  }).catch(() => {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "He has paid on it, or some was written off: put those right first",
      data: { refusal: "paid_on_it" },
    });
  });
  await forgetTheMoneyOf(tx, "dispatch", row.id);
  await tx.delete(dispatch).where(eq(dispatch.id, row.id));
  await clearNoticesAbout(tx, row.farmId, [row.id], now);
  await clearDebtNoticesOf(tx, row.farmId, row.id, now);
};

type DispatchChanges = z.infer<typeof dispatchCorrectionInput>["changes"];
type DispatchRow = NonNullable<Awaited<ReturnType<typeof loadDispatch>>>;

/** A Dispatch put right — its figures, its buyer, what he owes — and with it the Money Event. */
const putTheDispatchRight = async (
  tx: Tx,
  row: DispatchRow,
  to: NewValues<DispatchChanges>,
  { context, now }: { context: Corrector; now: Date }
) => {
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
  const item = { id: row.id, counterpartyId: row.buyerId };
  if (receivable.receivableMoney < row.receivableMoney) {
    await assertOwedCoversWrittenOff(
      tx,
      "dispatch",
      row.id,
      receivable.receivableMoney
    );
    await assertOwedCoversPaid(
      tx,
      row.farmId,
      item,
      receivable.receivableMoney
    );
  }
  const newBuyer =
    to.buyer === undefined
      ? undefined
      : await buyerOnTheDay(tx, row.farmId, to.buyer, now);
  if (newBuyer && newBuyer.buyerId !== row.buyerId) {
    await assertNothingStandsAgainst(tx, row.farmId, item);
  }
  const putRight = {
    ...(receivableMoved ? receivable : {}),
    ...(to.dispatchedAt === undefined ? {} : { dispatchedAt: to.dispatchedAt }),
    ...(to.litres === undefined ? {} : { litres: to.litres.toFixed(2) }),
    ...(to.deliveryNote === undefined ? {} : { deliveryNote: to.deliveryNote }),
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
    ...newBuyer,
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
};

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
    voided: false,
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readDispatch(tx, row.id),
  apply: (tx, row, to, { context, now }) =>
    to.voided
      ? voidTheDispatch(tx, row, now)
      : putTheDispatchRight(tx, row, to, { context, now }),
};
