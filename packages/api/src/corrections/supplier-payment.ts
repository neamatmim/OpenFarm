import { eq } from "@OpenFarm/db/operators";
import { supplierPayment } from "@OpenFarm/db/schema/supplier";
import { isAFarmDay, startOfFarmDay } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "../audit";
import { changeByOf } from "../closed-month-store";
import { farmDay } from "../farm-clock";
import { enteredOn } from "../money-by-hand-store";
import { farmAccountChange, paymentMethodChange } from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  bookMoney,
  farmAccountShownOf,
  forgetTheMoneyOf,
} from "../money-store";
import { assertInvoicePayments, supplierRefused } from "../supplier-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const load = (tx: Tx, farmId: string, id: string) =>
  tx.query.supplierPayment.findFirst({ where: { id, farmId } });
export const supplierPaymentCorrectionInput = correctionInput({
  amountMoney: changeOf(
    z.number().positive().max(100_000_000).multipleOf(0.01),
    z.number()
  ),
  paidOn: changeOf(farmDay, z.string()),
  paymentMethod: paymentMethodChange,
  farmAccount: farmAccountChange,
  note: changeOf(z.string().trim().max(500).nullable(), z.string().nullable()),
  voided: changeOf(z.literal(true), z.boolean()),
});

export const supplierPaymentCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof load>>>,
  z.infer<typeof supplierPaymentCorrectionInput>["changes"]
> = {
  entity: "supplier_payment",
  table: supplierPayment,
  roles: ["owner"],
  missing: "No such supplier payment",
  load,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    amountMoney: row.amountMoney,
    paidOn: row.paidOn,
    paymentMethod: row.paymentMethod,
    farmAccount: await farmAccountShownOf(
      tx,
      row.farmId,
      "supplier_payment",
      row.id
    ),
    note: row.note,
    voided: false,
  }),
  trail: async (tx, row) => (await load(tx, row.farmId, row.id)) ?? null,
  apply: async (tx, row, to, { context, now }) => {
    if (to.voided) {
      await forgetTheMoneyOf(
        tx,
        changeByOf(context, now),
        "supplier_payment",
        row.id
      );
      await tx.delete(supplierPayment).where(eq(supplierPayment.id, row.id));
      return;
    }
    const amountMoney = to.amountMoney ?? row.amountMoney;
    const paidOn = to.paidOn ?? row.paidOn;
    enteredOn(paidOn, now);
    if (!isAFarmDay(paidOn)) {
      supplierRefused("supplier_invoice_days");
    }
    const invoice = await assertInvoicePayments(tx, row.farmId, row.invoiceId, {
      payment: { id: row.id, paidOn, amountMoney },
    });
    const paymentMethod = to.paymentMethod ?? row.paymentMethod;
    const note = to.note === undefined ? row.note : to.note;
    await tx
      .update(supplierPayment)
      .set({ amountMoney, paidOn, paymentMethod, note })
      .where(eq(supplierPayment.id, row.id));
    await bookMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount
          ? accountSaid(["supplier_payment"], to.farmAccount)
          : undefined
      ),
      {
        source: "supplier_payment",
        sourceId: row.id,
        amountMoney,
        occurredAt: startOfFarmDay(paidOn),
        counterpartyId: invoice.counterpartyId,
        paymentMethod,
        categoryKey: "feed_in",
      }
    );
  },
};
