import { eq } from "@OpenFarm/db/operators";
import { abortion } from "@OpenFarm/db/schema/breeding";
import { z } from "zod";

import type { Tx } from "../audit";
import { assertLostWhenItCouldBe, readAbortion } from "../breeding-store";
import { requireClinicalInScope } from "../scope";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, herVenturesAround } from "./correction";

const loadAbortion = (tx: Tx, farmId: string, id: string) =>
  tx.query.abortion.findFirst({ where: { id, farmId } });

/** What putting an abortion right may change: the day, how far along she was, or the note. */
export const abortionCorrectionInput = correctionInput({
  abortedAt: changeOf(z.coerce.date(), z.coerce.date()),
  stageMonths: changeOf(z.number().int().min(1).max(9), z.number()),
  note: changeOf(z.string().trim().min(1).max(2000), z.string()),
});

/**
 * An abortion put right. The Vet's to change, as it was the Vet's to record — the Vet who recorded it, however long ago.
 * What it did to her pregnancy stands, and is nothing the Manager has to look at: an abortion recorded against the
 * wrong cow is a pregnancy to find again with a check, not one to restore from here.
 */
export const abortionCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadAbortion>>>,
  z.infer<typeof abortionCorrectionInput>["changes"]
> = {
  entity: "abortion",
  table: abortion,
  roles: ["vet"],
  visitingVet: true,
  // An Abortion is a clinical record of one Animal, and putting it right moves what her Venture's
  // Settlement counted her as costing.
  // An Abortion is one Animal's clinical record. Unreachable for a Venture's Animal today — a Venture
  // owns bought-in fattening stock, which carries no expected calving — and guarded all the same, so that
  // loosening that invariant cannot quietly open a settled Venture's books.
  venturesOf: herVenturesAround((row) => row.abortedAt),
  missing: "No such abortion",
  load: loadAbortion,
  entry: (row) => ({
    enteredAt: row.recordedAt,
    enteredBy: row.recordedBy,
    isHealthEntry: true,
  }),
  requireInScope: (scope, row) => requireClinicalInScope(scope, row.animalId),
  shown: (_tx, row) =>
    Promise.resolve({
      abortedAt: row.abortedAt,
      stageMonths: row.stageMonths,
      note: row.note,
    }),
  trail: (tx, row) => readAbortion(tx, row.id),
  apply: async (tx, row, to, { now }) => {
    if (to.abortedAt !== undefined) {
      await assertLostWhenItCouldBe(tx, to.abortedAt, now, row.serviceId);
    }
    await tx
      .update(abortion)
      .set({
        ...(to.abortedAt === undefined ? {} : { abortedAt: to.abortedAt }),
        ...(to.stageMonths === undefined
          ? {}
          : { stageMonths: to.stageMonths }),
        ...(to.note === undefined ? {} : { note: to.note }),
      })
      .where(eq(abortion.id, row.id));
  },
};
