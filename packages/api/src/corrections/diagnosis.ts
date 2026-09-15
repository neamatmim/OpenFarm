import { eq } from "@OpenFarm/db/operators";
import { diagnosis } from "@OpenFarm/db/schema/health";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import {
  diagnosisNoteInput,
  diseaseInput,
  raiseNotifiableAlerts,
  readDiagnosis,
  reconsiderTheReport,
} from "../health-store";
import type { RaisedAlert } from "../instances-store";
import { pushRaised } from "../push-send";
import { requireClinicalInScope } from "../scope";
import { textTheSafetyAlerts } from "../sms-send";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const loadDiagnosis = (tx: Tx, farmId: string, id: string) =>
  tx.query.diagnosis.findFirst({ where: { id, farmId } });

/**
 * What putting a Diagnosis right may change: what she has, shown by the name the farm reads, and the Vet's note — a
 * note set to nothing is cleared.
 */
export const diagnosisCorrectionInput = correctionInput({
  disease: changeOf(diseaseInput, z.string()),
  note: changeOf(diagnosisNoteInput.nullable(), z.string().nullable()),
});

/** Whether the farm must report what she now has, the work to deliver the report, and who to tell. */
interface Reconsidered {
  notifiable: boolean;
  reportInstanceId: string | null;
  alerts: RaisedAlert[];
}

/**
 * A Diagnosis put right. The Vet's own, and the window does not close — an animal's clinical history matters for as long
 * as she is on the farm. Another Vet's conclusion is not this Vet's to change, and the Manager may read it but never
 * write it (roles matrix): only their standing as the Vet is asked about.
 */
export const diagnosisCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadDiagnosis>>>,
  z.infer<typeof diagnosisCorrectionInput>["changes"],
  Reconsidered
> = {
  entity: "diagnosis",
  table: diagnosis,
  roles: ["vet"],
  visitingVet: true,
  missing: "No such diagnosis",
  load: loadDiagnosis,
  entry: (row) => ({
    enteredAt: row.recordedAt,
    enteredBy: row.diagnosedBy,
    isHealthEntry: true,
  }),
  requireInScope: (scope, row) => requireClinicalInScope(scope, row.animalId),
  // The English beside the name follows the name.
  shownAs: { disease: (to) => to.bn },
  shown: (_tx, row) =>
    Promise.resolve({
      disease: row.disease,
      note: row.note,
    }),
  apply: async (tx, row, to, { context, now }) => {
    const disease = to.disease ?? {
      bn: row.disease,
      en: row.diseaseEn ?? undefined,
    };
    await tx
      .update(diagnosis)
      .set({
        ...(to.disease
          ? { disease: to.disease.bn, diseaseEn: to.disease.en ?? null }
          : {}),
        ...(to.note === undefined ? {} : { note: to.note || null }),
      })
      .where(eq(diagnosis.id, row.id));
    // A Correction can start the duty or end it. Named a disease on the list where it did not before, the letter is owed
    // from now; named something off the list, a report nobody has delivered is withdrawn and the work to deliver it
    // closed — leaving the Manager under orders to write about a disease the Vet has taken back would be worse than never
    // having raised it.
    const her = await tx.query.animal.findFirst({
      where: { id: row.animalId, farmId: row.farmId },
      columns: { id: true, penId: true, tagNumber: true },
    });
    if (!her) {
      throw new ORPCError("NOT_FOUND");
    }
    const owed = await reconsiderTheReport(tx, {
      farmId: row.farmId,
      diagnosisId: row.id,
      disease,
      animalId: her.id,
      penId: her.penId,
      now,
      trail: audited(context).recordEvent,
    });
    const alerts = owed.notifiable
      ? await raiseNotifiableAlerts(
          tx,
          row.farmId,
          {
            diagnosisId: row.id,
            tagNumber: her.tagNumber,
            disease: disease.bn,
          },
          now
        )
      : [];
    return {
      notifiable: owed.notifiable,
      reportInstanceId: owed.instanceId,
      alerts,
    };
  },
  trail: (tx, row) => readDiagnosis(tx, row.id),
  // Outside the transaction: a push is a call to somebody else's server, and a hung one would hold a lock the whole shed
  // is waiting on. A text message is the same, and this is one of the two the farm sends them for.
  afterwards: async (context, { alerts }) => {
    await pushRaised(context, alerts, context.clock.now());
    await textTheSafetyAlerts(context, alerts);
  },
};
