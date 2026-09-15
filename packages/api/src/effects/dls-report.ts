import { eq } from "@OpenFarm/db/operators";
import { dlsReport } from "@OpenFarm/db/schema/health";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { noteIn } from "./evidence";

type ReportFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "evidence"
  | "completionId"
  | "recordedBy"
  | "recordedAt"
>;

/**
 * Records that the letter reached the Upazila Livestock Officer, and under what reference.
 *
 * The Step is completed when the letter is delivered, so the moment it was recorded is the
 * moment it went; the required note is the reference the office gave it back under. A report
 * that was sent and cannot be evidenced is a report that was not sent, which is why the
 * reference is the Step's evidence rather than something to fill in afterwards.
 */
const deliverTheReport = async (
  tx: Tx,
  input: ReportFacts
): Promise<EffectResult> => {
  const owed = await tx.query.dlsReport.findFirst({
    where: { instanceId: input.instance.id },
    columns: { id: true },
  });
  if (!owed) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This work is not the report of any diagnosis",
    });
  }
  // The reference is required evidence, and the Step runs once and is never skipped: the published Version says so.
  const reference = noteIn(input.step, input.evidence);
  await tx
    .update(dlsReport)
    .set({
      deliveredAt: input.recordedAt,
      reference,
      completionId: input.completionId,
      deliveredBy: input.recordedBy,
    })
    .where(eq(dlsReport.id, owed.id));
  return { kind: "dls_report", reference, delivered: true };
};

/** A Step that records the notifiable-disease letter delivered. */
export const dlsReportEffect: EffectKind<ReportFacts> = {
  kind: "dls_report",
  apply: deliverTheReport,
};
