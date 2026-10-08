import { farmDayOf } from "@OpenFarm/domain";

import { clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import type { MedicineAdjustment } from "../medicine-count-store";
import {
  medicineShortMoney,
  recordMedicineCount,
} from "../medicine-count-store";
import { tell } from "../notice";
import type { EffectInput, EffectKind, EffectResult } from "./effect";

type MedicineCountFacts = Pick<
  EffectInput,
  | "instance"
  | "completionId"
  | "medicineCounts"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/**
 * Tells the Owner of a count that found more medicine missing than the Owner's line, in taka at what each dose cost —
 * told once for the count, in the evening's post. A count put right later is not told again, but one put right to
 * no shortfall takes its notice down.
 */
const tellIfTheMedicineCameUpShort = async (
  tx: Tx,
  input: MedicineCountFacts,
  adjustments: readonly MedicineAdjustment[]
) => {
  const shortMoney = medicineShortMoney(adjustments);
  const farm = await tx.query.farm.findFirst({
    where: { id: input.instance.farmId },
    columns: { medicineShortTellMoney: true },
  });
  if (!farm || shortMoney <= farm.medicineShortTellMoney) {
    // Put right to no shortfall: the notice of one goes, in the post and in the app.
    await clearNoticesAbout(
      tx,
      input.instance.farmId,
      [input.completionId],
      input.now,
      ["medicine_short"]
    );
    return;
  }
  await tell(
    tx,
    input.instance.farmId,
    {
      kind: "medicine_short",
      about: { id: input.completionId },
      facts: {
        shortMoney: Math.round(shortMoney),
        countedOn: farmDayOf(input.recordedAt),
      },
    },
    input.now
  );
};

/** Counts the medicine: how many doses of each product are really there, and why it differs. The Manager's, who buys
 *  it, or the Owner's. */
const countTheMedicine = async (
  tx: Tx,
  input: MedicineCountFacts
): Promise<EffectResult> => {
  const adjustments = await recordMedicineCount(tx, {
    farmId: input.instance.farmId,
    completionId: input.completionId,
    counts: input.medicineCounts,
    countedAt: input.recordedAt,
    countedBy: input.recordedBy,
    now: input.now,
  });
  await tellIfTheMedicineCameUpShort(tx, input, adjustments);
  return { kind: "medicine_count", adjustments };
};

/** A Step that counts the medicine. */
export const medicineCountEffect: EffectKind<MedicineCountFacts> = {
  kind: "medicine_count",
  recordableBy: {
    roles: ["owner", "manager"],
    refusal: {
      message: "Counting the medicine is the Manager's or the Owner's",
      reason: "manager_only",
    },
  },
  apply: countTheMedicine,
  recorded: async (db, completionId) => {
    const lines = await db.query.medicineCount.findMany({
      where: { completionId },
      columns: { drugProductId: true, counted: true, reason: true },
      orderBy: { drugProductId: "asc" },
    });
    return lines.length > 0
      ? {
          medicineCounts: lines.map((line) => ({
            drugProductId: line.drugProductId,
            counted: line.counted,
            ...(line.reason ? { reason: line.reason } : {}),
          })),
        }
      : {};
  },
  // A reason left out, or only spaces, is none; the lines in the farm's order, in whole doses.
  asShown: ({ medicineCounts }) =>
    medicineCounts
      ? {
          medicineCounts: medicineCounts
            .map((line) => ({
              drugProductId: line.drugProductId,
              counted: Math.round(line.counted),
              ...(line.reason?.trim() ? { reason: line.reason.trim() } : {}),
            }))
            .toSorted((a, b) => a.drugProductId.localeCompare(b.drugProductId)),
        }
      : {},
};
