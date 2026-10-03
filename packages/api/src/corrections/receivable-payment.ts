import { eq } from "@OpenFarm/db/operators";
import { receivablePayment } from "@OpenFarm/db/schema/money";
import { startOfFarmDay } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "../audit";
import { assertTheHand, handOfTheRecord } from "../cash-store";
import { farmDay } from "../farm-clock";
import { enteredOn } from "../money-by-hand-store";
import {
  amountInput,
  farmAccountChange,
  noteInput,
  paymentMethodChange,
} from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  bookMoney,
  farmAccountShownOf,
  paymentMethodOf,
} from "../money-store";
import {
  CATEGORY_OF_RECEIVABLE,
  assertPaidNoMoreThanOwed,
  owingOf,
  readReceivablePayment,
} from "../receivable-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadPayment = (tx: Tx, farmId: string, id: string) =>
  tx.query.receivablePayment.findFirst({ where: { id, farmId } });

/** What putting a Receivable Payment right may change: how much, the day it came, how it was paid, and the note. Who paid
 *  and what for are not changed: a payment written against the wrong buyer is taken back and written again. */
export const receivablePaymentCorrectionInput = correctionInput({
  amountMoney: changeOf(amountInput, z.number()),
  paidOn: changeOf(farmDay, z.string()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account mobile money or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
  note: changeOf(noteInput.nullable(), z.string().nullable()),
  /** Whose hand took the cash, put right on the rule a payment is written on (`assertTheHand`). */
  heldBy: changeOf(z.string(), z.string().nullable()),
});

/** A Receivable Payment put right — and with it its Money Event, rather than a second one. */
export const receivablePaymentCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadPayment>>>,
  z.infer<typeof receivablePaymentCorrectionInput>["changes"]
> = {
  entity: "receivable_payment",
  table: receivablePayment,
  roles: ["owner", "manager"],
  missing: "No such payment",
  load: loadPayment,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    farmAccount: await farmAccountShownOf(
      tx,
      row.farmId,
      "receivable_payment",
      row.id
    ),
    amountMoney: row.amountMoney,
    paidOn: row.paidOn,
    paymentMethod: await paymentMethodOf(
      tx,
      row.farmId,
      "receivable_payment",
      row.id
    ),
    note: row.note,
    heldBy: await handOfTheRecord(tx, row.farmId, "receivable_payment", row.id),
  }),
  trail: (tx, row) => readReceivablePayment(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    const amountMoney = to.amountMoney ?? row.amountMoney;
    const note = to.note === undefined ? row.note : to.note;
    if (amountMoney > row.amountMoney) {
      // What he owes now already has this payment taken off it; only what it grows by is asked about.
      const owingMoney = await owingOf(
        tx,
        row.farmId,
        row.counterpartyId,
        row.kind
      );
      assertPaidNoMoreThanOwed({
        amountMoney: amountMoney - row.amountMoney,
        owingMoney,
        note,
      });
    }
    const paidOn = to.paidOn ?? row.paidOn;
    enteredOn(paidOn, now);
    const putRight = {
      ...(to.amountMoney === undefined ? {} : { amountMoney: to.amountMoney }),
      ...(to.paidOn === undefined ? {} : { paidOn: to.paidOn }),
      ...(to.note === undefined ? {} : { note: to.note }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(receivablePayment)
        .set(putRight)
        .where(eq(receivablePayment.id, row.id));
    }
    await bookMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount
          ? accountSaid(["receivable_payment"], to.farmAccount)
          : undefined
      ),
      {
        source: "receivable_payment",
        sourceId: row.id,
        amountMoney,
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
        categoryKey: CATEGORY_OF_RECEIVABLE[row.kind],
      }
    );
  },
};
