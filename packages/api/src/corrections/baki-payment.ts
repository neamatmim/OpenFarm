import { eq } from "@OpenFarm/db/operators";
import { bakiPayment } from "@OpenFarm/db/schema/money";
import { startOfFarmDay } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "../audit";
import {
  CATEGORY_OF_BAKI,
  assertPaidNoMoreThanOwed,
  owingOf,
  readBakiPayment,
} from "../baki-store";
import { assertTheHand, handOfTheRecord } from "../cash-store";
import { farmDay } from "../farm-clock";
import { enteredOn } from "../money-by-hand-store";
import { amountInput, noteInput, paymentMethodChange } from "../money-inputs";
import { bookMoney, bookingOf, paymentMethodOf } from "../money-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadPayment = (tx: Tx, farmId: string, id: string) =>
  tx.query.bakiPayment.findFirst({ where: { id, farmId } });

/** What putting a Baki Payment right may change: how much, the day it came, how it was paid, and the note. Who paid
 *  and what for are not changed: a payment written against the wrong buyer is taken back and written again. */
export const bakiPaymentCorrectionInput = correctionInput({
  amountBdt: changeOf(amountInput, z.number()),
  paidOn: changeOf(farmDay, z.string()),
  paymentMethod: paymentMethodChange,
  note: changeOf(noteInput.nullable(), z.string().nullable()),
  /** Whose hand took the cash, put right on the rule a payment is written on (`assertTheHand`). */
  heldBy: changeOf(z.string(), z.string().nullable()),
});

/** A Baki Payment put right — and with it its Money Event, rather than a second one. */
export const bakiPaymentCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadPayment>>>,
  z.infer<typeof bakiPaymentCorrectionInput>["changes"]
> = {
  entity: "baki_payment",
  table: bakiPayment,
  roles: ["owner", "manager"],
  missing: "No such payment",
  load: loadPayment,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    amountBdt: row.amountBdt,
    paidOn: row.paidOn,
    paymentMethod: await paymentMethodOf(
      tx,
      row.farmId,
      "baki_payment",
      row.id
    ),
    note: row.note,
    heldBy: await handOfTheRecord(tx, row.farmId, "baki_payment", row.id),
  }),
  trail: (tx, row) => readBakiPayment(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    const amountBdt = to.amountBdt ?? row.amountBdt;
    const note = to.note === undefined ? row.note : to.note;
    if (amountBdt > row.amountBdt) {
      // What he owes now already has this payment taken off it; only what it grows by is asked about.
      const owingBdt = await owingOf(
        tx,
        row.farmId,
        row.counterpartyId,
        row.kind
      );
      assertPaidNoMoreThanOwed({
        amountBdt: amountBdt - row.amountBdt,
        owingBdt,
        note,
      });
    }
    const paidOn = to.paidOn ?? row.paidOn;
    enteredOn(paidOn, now);
    const putRight = {
      ...(to.amountBdt === undefined ? {} : { amountBdt: to.amountBdt }),
      ...(to.paidOn === undefined ? {} : { paidOn: to.paidOn }),
      ...(to.note === undefined ? {} : { note: to.note }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(bakiPayment)
        .set(putRight)
        .where(eq(bakiPayment.id, row.id));
    }
    await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
      source: "baki_payment",
      sourceId: row.id,
      amountBdt,
      occurredAt: startOfFarmDay(paidOn),
      counterpartyId: row.counterpartyId,
      paymentMethod: to.paymentMethod,
      ...(to.heldBy === undefined
        ? {}
        : {
            heldBy: await assertTheHand(
              tx,
              row.farmId,
              { id: context.actor.id, roles: context.roles },
              to.heldBy
            ),
          }),
      categoryKey: CATEGORY_OF_BAKI[row.kind],
    });
  },
};
