import { eq } from "@OpenFarm/db/operators";
import { bakiWriteOff } from "@OpenFarm/db/schema/money";
import { z } from "zod";

import type { Tx } from "../audit";
import {
  assertWrittenOffNoMoreThanOwed,
  owingOnItem,
  readWriteOff,
} from "../baki-store";
import { noteInput } from "../money-inputs";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadWriteOff = (tx: Tx, farmId: string, id: string) =>
  tx.query.bakiWriteOff.findFirst({ where: { id, farmId } });

/** What putting a Write-off right may change: how much — nothing takes it back whole — and why. */
export const writeOffCorrectionInput = correctionInput({
  amountBdt: changeOf(z.number().min(0).max(100_000_000), z.number()),
  why: changeOf(noteInput, z.string()),
});

/** A Write-off put right. The Owner's alone, as writing it off is. */
export const writeOffCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadWriteOff>>>,
  z.infer<typeof writeOffCorrectionInput>["changes"]
> = {
  entity: "baki_write_off",
  table: bakiWriteOff,
  roles: ["owner"],
  missing: "No such write-off",
  load: loadWriteOff,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({ amountBdt: row.amountBdt, why: row.reason }),
  trail: (tx, row) => readWriteOff(tx, row.id),
  apply: async (tx, row, to) => {
    if (to.amountBdt !== undefined && to.amountBdt > row.amountBdt) {
      // What is owing now already has this write-off taken off it; only what it grows by is asked about.
      const standing = await owingOnItem(
        tx,
        row.farmId,
        row.source,
        row.sourceId
      );
      assertWrittenOffNoMoreThanOwed(
        to.amountBdt - row.amountBdt,
        standing?.owingBdt ?? 0
      );
    }
    const putRight = {
      ...(to.amountBdt === undefined ? {} : { amountBdt: to.amountBdt }),
      ...(to.why === undefined ? {} : { reason: to.why }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(bakiWriteOff)
        .set(putRight)
        .where(eq(bakiWriteOff.id, row.id));
    }
  },
};
