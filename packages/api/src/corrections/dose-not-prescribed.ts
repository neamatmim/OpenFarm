import { eq } from "@OpenFarm/db/operators";
import { treatment } from "@OpenFarm/db/schema/health";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import { recomputeWithdrawal } from "../health-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, venturesCharged } from "./correction";

/** A dose not prescribed, and only that: one given under a course or a Campaign is put right on its Step. */
const loadDose = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.treatment.findFirst({ where: { id, farmId } });
  if (row && (row.prescriptionId !== null || row.instanceId !== null)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "That dose was given under a course or a Campaign; put its Step right",
      data: { refusal: "correct_the_step" },
    });
  }
  return row;
};

/** A dose not prescribed is taken back, never retyped: the wrong cow, the wrong product, written twice — voided, and
 *  written again as it was. */
export const doseNotPrescribedCorrectionInput = correctionInput({
  voided: changeOf(z.literal(true), z.boolean()),
});

/**
 * A dose not prescribed voided — the tag typed wrong, written twice — by the Owner or the Manager in their window, with a
 * reason, as a death is (the Owner, 2026-10-07). There was no way back: the wrong cow's milk and meat were held, the cow
 * really dosed was not, and the false dose stood on her treatment register and passport. Her holds are worked out again
 * from the doses that remain, and a hold cut short is told to the Manager as one started is.
 */
export const doseNotPrescribedCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadDose>>>,
  z.infer<typeof doseNotPrescribedCorrectionInput>["changes"]
> = {
  entity: "treatment",
  table: treatment,
  roles: ["owner", "manager"],
  missing: "No such dose",
  load: loadDose,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.givenBy }),
  // What it cost is charged to her: a settled Venture whose animal it was is closed.
  venturesOf: (tx, row) =>
    venturesCharged(tx, row.farmId, (costs) =>
      costs.charges.filter(
        (one) =>
          one.kind === "dose" &&
          one.animalId === row.animalId &&
          one.fromId === row.productId
      )
    ),
  shown: () => Promise.resolve({ voided: false }),
  trail: async (tx, row) =>
    (await tx.query.treatment.findFirst({ where: { id: row.id } })) ?? null,
  apply: async (tx, row, to, { now }) => {
    if (!to.voided) {
      return;
    }
    await tx.delete(treatment).where(eq(treatment.id, row.id));
    await recomputeWithdrawal(tx, row.farmId, row.animalId, now);
    // The Vet was told of it; that it was given is no longer so.
    await clearNoticesAbout(tx, row.farmId, [row.id], now);
  },
};
