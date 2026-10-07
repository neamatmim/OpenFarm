import { and, eq } from "@OpenFarm/db/operators";
import { moneyEvent, vetFee, vetFeeAnimal } from "@OpenFarm/db/schema/money";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import { farmDay } from "../farm-clock";
import { amountInput } from "../money-inputs";
import { forgetTheMoneyOf } from "../money-store";
import type { CorrectionKind } from "./correction";
import {
  changeOf,
  correctionInput,
  somethingChanged,
  venturesCharged,
} from "./correction";

const loadFee = (tx: Tx, farmId: string, id: string) =>
  tx.query.vetFee.findFirst({ where: { id, farmId } });

/** What putting a Vet Fee right may change: how much, the day of the visit, the note — or, written twice or never
 *  charged, taking it away. Which animals it was charged to stay as the Vet named them. */
export const vetFeeCorrectionInput = correctionInput({
  amountMoney: changeOf(amountInput, z.number()),
  visitedOn: changeOf(farmDay, z.string()),
  note: changeOf(
    z.string().trim().min(1).max(300).nullable(),
    z.string().nullable()
  ),
  voided: changeOf(z.literal(true), z.boolean()),
});

/**
 * A Vet Fee put right — by the Vet who charged it, within the Vet's window, and by the Owner at any time — and its Money
 * Event with it. There was no way to put one right at all: a ৳15,000 fee that should have read ৳1,500 was charged to the
 * animals it named, Venture animals among them, for good. Refused, as any cost is, once a settled Venture's figures
 * rest on it.
 */
export const vetFeeCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadFee>>>,
  z.infer<typeof vetFeeCorrectionInput>["changes"]
> = {
  entity: "vet_fee",
  table: vetFee,
  roles: ["owner", "vet"],
  missing: "No such fee",
  load: loadFee,
  // The Vet's own record, as their clinical ones are: the Vet stands over it as over a Diagnosis.
  entry: (row) => ({
    enteredAt: row.recordedAt,
    enteredBy: row.vetId,
    isHealthEntry: true,
  }),
  // Charged to the animals it names on the day of the visit: a settled Venture whose animal it reached is closed.
  venturesOf: (tx, row) =>
    venturesCharged(tx, row.farmId, (costs) =>
      costs.charges.filter((one) => one.kind === "vet" && one.fromId === row.id)
    ),
  shown: (_tx, row) =>
    Promise.resolve({
      amountMoney: row.amountMoney,
      visitedOn: farmDayOf(row.visitedOn),
      note: row.note,
      voided: false,
    }),
  trail: async (tx, row) =>
    (await tx.query.vetFee.findFirst({
      where: { id: row.id },
      with: { animals: { columns: { animalId: true } } },
    })) ?? null,
  apply: async (tx, row, to, { now }) => {
    if (to.voided) {
      await forgetTheMoneyOf(tx, "vet_fee", row.id);
      await tx.delete(vetFeeAnimal).where(eq(vetFeeAnimal.vetFeeId, row.id));
      await tx.delete(vetFee).where(eq(vetFee.id, row.id));
      await clearNoticesAbout(tx, row.farmId, [row.id], now);
      return;
    }
    const visitedOn = to.visitedOn
      ? startOfFarmDay(to.visitedOn)
      : row.visitedOn;
    if (visitedOn > now) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A visit cannot have been on a day that has not come yet",
        data: { refusal: "visited_in_the_future" },
      });
    }
    const putRight = {
      ...(to.amountMoney === undefined ? {} : { amountMoney: to.amountMoney }),
      ...(to.visitedOn === undefined ? {} : { visitedOn }),
      ...(to.note === undefined ? {} : { note: to.note }),
    };
    if (somethingChanged(putRight)) {
      await tx.update(vetFee).set(putRight).where(eq(vetFee.id, row.id));
    }
    // Its Money Event says what the fee now says: the money paid to the Vet, on the day of the visit.
    const money = {
      ...(to.amountMoney === undefined ? {} : { amountMoney: to.amountMoney }),
      ...(to.visitedOn === undefined ? {} : { occurredAt: visitedOn }),
    };
    if (somethingChanged(money)) {
      await tx
        .update(moneyEvent)
        .set(money)
        .where(
          and(
            eq(moneyEvent.farmId, row.farmId),
            eq(moneyEvent.source, "vet_fee"),
            eq(moneyEvent.sourceId, row.id)
          )
        );
    }
  },
};
