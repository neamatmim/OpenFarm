import { eq } from "@OpenFarm/db/operators";
import { receivableWriteOff } from "@OpenFarm/db/schema/money";
import { z } from "zod";

import type { Tx } from "../audit";
import { noteInput } from "../money-inputs";
import {
  assertWrittenOffNoMoreThanOwed,
  lockTheBuyer,
  owingOnItem,
  readWriteOff,
} from "../receivable-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadWriteOff = (tx: Tx, farmId: string, id: string) =>
  tx.query.receivableWriteOff.findFirst({ where: { id, farmId } });

/** What putting a Write-off right may change: how much — nothing takes it back whole — and why. */
export const writeOffCorrectionInput = correctionInput({
  amountMoney: changeOf(z.number().min(0).max(100_000_000), z.number()),
  why: changeOf(noteInput, z.string()),
});

/** A Write-off put right. The Owner's alone, as writing it off is. */
export const writeOffCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadWriteOff>>>,
  z.infer<typeof writeOffCorrectionInput>["changes"]
> = {
  entity: "receivable_write_off",
  table: receivableWriteOff,
  roles: ["owner"],
  missing: "No such write-off",
  load: loadWriteOff,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({ amountMoney: row.amountMoney, why: row.reason }),
  trail: (tx, row) => readWriteOff(tx, row.id),
  apply: async (tx, row, to) => {
    if (to.amountMoney !== undefined && to.amountMoney > row.amountMoney) {
      // Under his lock, as a write-off is written: a payment at the same moment is counted before this one grows.
      await lockTheBuyer(tx, row.counterpartyId);
      // What is owing now already has this write-off taken off it; only what it grows by is asked about.
      const standing = await owingOnItem(
        tx,
        row.farmId,
        row.source,
        row.sourceId
      );
      assertWrittenOffNoMoreThanOwed(
        to.amountMoney - row.amountMoney,
        standing?.owingMoney ?? 0
      );
    }
    const putRight = {
      ...(to.amountMoney === undefined ? {} : { amountMoney: to.amountMoney }),
      ...(to.why === undefined ? {} : { reason: to.why }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(receivableWriteOff)
        .set(putRight)
        .where(eq(receivableWriteOff.id, row.id));
    }
  },
};
