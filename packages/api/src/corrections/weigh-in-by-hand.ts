import { weighIn } from "@OpenFarm/db/schema/fattening";
import { z } from "zod";

import type { Tx } from "../audit";
import { putRightByHand } from "../effects/weigh-in";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, herVenturesAround } from "./correction";

/** A reading typed on her page, and only one: a round's reading is its Step's, and is put right on the Step. */
const loadTyped = (tx: Tx, farmId: string, id: string) =>
  tx.query.weighIn.findFirst({
    where: { id, farmId, completionId: { isNull: true } },
  });

/** What putting a typed reading right may change: its weight, its moment, or taking it off her record. */
export const weighInByHandCorrectionInput = correctionInput({
  weightKg: changeOf(z.number().positive().max(2000), z.number()),
  weighedAt: changeOf(z.coerce.date(), z.coerce.date()),
  /** Typed against the wrong animal, or never taken: off her record, with the reason kept in the trail. */
  voided: changeOf(z.literal(true), z.boolean()),
});

/**
 * A Weigh-in typed on her page put right, by the Owner or the Manager who may type one. Its Correction Window runs from
 * when it was typed, not from the moment it says she was weighed — that moment may be months before. Refused once her
 * Venture has settled on the figures it stood in.
 */
export const weighInByHandCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadTyped>>>,
  z.infer<typeof weighInByHandCorrectionInput>["changes"]
> = {
  entity: "weigh_in",
  table: weighIn,
  roles: ["owner", "manager"],
  venturesOf: herVenturesAround((row) => row.weighedAt),
  missing: "No such weigh-in typed on her page",
  load: loadTyped,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({
      weightKg: Number(row.weightKg),
      weighedAt: row.weighedAt,
      voided: false,
    }),
  trail: async (tx, row) =>
    (await tx.query.weighIn.findFirst({
      where: { id: row.id },
      columns: { weightKg: true, weighedAt: true, flaggedNote: true },
    })) ?? null,
  apply: (tx, row, to, { now }) => putRightByHand(tx, row, to, now),
};
