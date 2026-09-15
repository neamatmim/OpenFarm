import { moneyEvent } from "@OpenFarm/db/schema/money";
import { farmDayOf } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import {
  assertWageNotYetEntered,
  categoryForEntered,
  enteredOn,
  keepReceipt,
  readEntered,
  refusedByHand,
} from "../money-by-hand-store";
import {
  amountInput,
  counterpartyInput,
  monthInput,
  noteInput,
  paymentMethodChange,
  receiptInput,
  sideInput,
} from "../money-inputs";
import { bookMoney, bookingOf } from "../money-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

/** Money entered by hand, and only that: a record's own money is put right on the record. */
const loadEntered = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.moneyEvent.findFirst({
    where: { id, farmId },
    with: { counterparty: { columns: { name: true } } },
  });
  if (row && row.source !== "by_hand") {
    throw refusedByHand(
      "That money comes from a record; put the record right",
      "correct_the_record"
    );
  }
  return row;
};

/**
 * What putting right money entered by hand may change — the amount, the day, the Category, who with, how it was paid,
 * the note, the wage's month, the Side — and a photo of the receipt that came later. A note, a month or a Side set to
 * nothing is cleared.
 */
export const moneyByHandCorrectionInput = correctionInput({
  categoryId: changeOf(z.string(), z.string()),
  amountBdt: changeOf(amountInput, z.number()),
  occurredOn: changeOf(farmDay, z.string()),
  counterparty: changeOf(counterpartyInput, z.string().nullable()),
  paymentMethod: paymentMethodChange,
  note: changeOf(noteInput.nullable(), z.string().nullable()),
  wageMonth: changeOf(monthInput.nullable(), z.string().nullable()),
  side: changeOf(sideInput.nullable(), z.string().nullable()),
}).extend({ receipt: receiptInput.optional() });

type Input = z.infer<typeof moneyByHandCorrectionInput>;

/**
 * Money entered by hand, put right. The Manager's alone, as entering it is: the Owner approves what the Manager enters,
 * and putting right their own approval would step round it.
 */
export const moneyByHandCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadEntered>>>,
  Input["changes"],
  unknown,
  Pick<Input, "receipt">
> = {
  entity: "money_event",
  table: moneyEvent,
  roles: ["manager"],
  missing: "No such money entry",
  load: loadEntered,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({
      categoryId: row.categoryId,
      amountBdt: Number(row.amountBdt),
      occurredOn: farmDayOf(row.occurredAt),
      counterparty: row.counterparty?.name ?? null,
      paymentMethod: row.paymentMethod,
      note: row.note,
      wageMonth: row.wageMonth,
      side: row.side,
    }),
  shownAs: { counterparty: (to) => to.name },
  changesBeyondValues: ({ receipt }) => receipt !== undefined,
  trail: (tx, row) => readEntered(tx, row.farmId, row.id),
  apply: async (tx, row, to, { context, now, extra }) => {
    const wageMonth = to.wageMonth === undefined ? row.wageMonth : to.wageMonth;
    const categoryId = to.categoryId ?? row.categoryId;
    const category = await categoryForEntered(tx, row.farmId, categoryId, {
      wageMonth,
      alreadyUnderIt: categoryId === row.categoryId,
    });
    const counterpartyId =
      to.counterparty === undefined
        ? row.counterpartyId
        : await counterpartyNamed(tx, row.farmId, to.counterparty, now);
    if (counterpartyId !== null) {
      await assertWageNotYetEntered(tx, row.farmId, {
        counterpartyId,
        wageMonth,
        id: row.id,
      });
    }
    await bookMoney(
      tx,
      bookingOf(context, context.roleUsed, now),
      {
        source: "by_hand",
        sourceId: row.id,
        amountBdt: to.amountBdt ?? Number(row.amountBdt),
        occurredAt:
          to.occurredOn === undefined
            ? row.occurredAt
            : enteredOn(to.occurredOn, now),
        counterpartyId,
        paymentMethod: to.paymentMethod,
      },
      {
        id: row.id,
        category,
        note: to.note === undefined ? row.note : to.note,
        wageMonth,
        side: to.side === undefined ? row.side : to.side,
      }
    );
    if (extra.receipt) {
      await keepReceipt(tx, row.farmId, row.id, extra.receipt, now);
    }
  },
};
