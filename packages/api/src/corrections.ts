import type { CorrectionRefusal, CorrectionWindows } from "@OpenFarm/domain";
import { describeWindow } from "@OpenFarm/domain";
import { z } from "zod";

/** A Correction carries a reason. Every one of them, whatever is being put right. */
export const reasonInput = z.string().trim().min(1).max(200);

/** The Correction Windows as this Farm has them set. */
export const correctionWindows = (farm: {
  staffCorrectionHours: number;
  managerCorrectionDays: number;
}): CorrectionWindows => ({
  staffHours: farm.staffCorrectionHours,
  managerDays: farm.managerCorrectionDays,
});

/** Why the Correction was refused, as facts rather than as a sentence. The person reading it
 *  reads Bangla; composing their message here would mean composing it in English. The
 *  message on the error is for whoever is reading a log. */
export const refusalData = (refusal: CorrectionRefusal) => ({
  ...refusal,
  ...describeWindow(refusal.windowHours),
});
