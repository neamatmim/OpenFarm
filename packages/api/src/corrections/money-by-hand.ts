import { moneyEvent } from "@OpenFarm/db/schema/money";
import type { Side } from "@OpenFarm/domain";
import { farmDayOf, herdShares, startOfFarmDay } from "@OpenFarm/domain";
import { z } from "zod";

import type { Tx } from "../audit";
import { herdCostOf } from "../cost-store";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import {
  assertWageNotYetEntered,
  categoryForEntered,
  chargesTheAnimals,
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
import { changeOf, correctionInput, venturesCharged } from "./correction";

/** Money entered by hand, and only that: a record's own money is put right on the record. */
const loadEntered = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.moneyEvent.findFirst({
    where: { id, farmId },
    with: {
      counterparty: { columns: { name: true } },
      // Whether it is charged to the animals, which is what decides whether it reaches a Venture at all.
      category: { columns: { chargedToAnimals: true } },
    },
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

type Entered = NonNullable<Awaited<ReturnType<typeof loadEntered>>>;

/** Where money entered by hand sits, as a Herd Cost is split: under which Category, across which Side, and
 *  on the day whose month the animals' days are counted in. */
interface Spot {
  categoryId: string;
  side: Side | null;
  at: Date;
}

const sameSpot = (a: Spot, b: Spot) =>
  a.categoryId === b.categoryId &&
  a.side === b.side &&
  a.at.getTime() === b.at.getTime();

/**
 * The Ventures a Herd Cost put right would move — as the money sits, and as the Correction would leave it.
 *
 * Both, because this Correction can carry money into a settled Venture's reach as easily as out of it: a
 * month, a Side or a Category moved is money taken off one set of animals and put onto another, and asking
 * only about where it sits would see the first half of that and let the second through.
 */
const venturesOfEntered = async (
  tx: Tx,
  row: Entered,
  changes: Input["changes"]
): Promise<readonly string[]> => {
  // The Farm's purse alone is split across the herd; a Venture's own hand-entered cost is not a Herd Cost.
  if (row.purseVentureId !== null) {
    return [];
  }
  const sits: Spot = {
    categoryId: row.categoryId,
    side: row.side,
    at: row.occurredAt,
  };
  const lands: Spot = {
    categoryId: changes.categoryId?.to ?? sits.categoryId,
    side: changes.side === undefined ? sits.side : changes.side.to,
    at: changes.occurredOn ? startOfFarmDay(changes.occurredOn.to) : sits.at,
  };
  const spots = sameSpot(sits, lands) ? [sits] : [sits, lands];
  // Its own Category came back with the record; only the one it is being moved to has to be asked about.
  const charges = new Map([
    [sits.categoryId, row.category?.chargedToAnimals ?? false],
  ]);
  if (!charges.has(lands.categoryId)) {
    charges.set(
      lands.categoryId,
      await chargesTheAnimals(tx, row.farmId, lands.categoryId)
    );
  }
  const costs = spots.flatMap((spot) => {
    const cost = herdCostOf({
      ...spot,
      chargedToAnimals: charges.get(spot.categoryId) ?? false,
      // The amount decides nothing here: the question is which animals it is split across, not how much
      // each carries. A share of nothing still names the mouth it was charged to.
      bdt: 0,
    });
    return cost ? [cost] : [];
  });
  if (costs.length === 0) {
    return [];
  }
  return venturesCharged(
    tx,
    row.farmId,
    ({ history }) => herdShares({ costs, history }).shares
  );
};

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
  roles: ["owner", "manager"],
  missing: "No such money entry",
  venturesOf: venturesOfEntered,
  load: loadEntered,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({
      categoryId: row.categoryId,
      amountBdt: row.amountBdt,
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
        amountBdt: to.amountBdt ?? row.amountBdt,
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
