import { uuidv7 as newId } from "@OpenFarm/db/ids";
import type { InspectorRegister } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";

type FarmContext = Context & { farm: NonNullable<Context["farm"]> };

/** Every report and paper the farm produces for somebody outside it, by the name the trail records. */
export type ExportedReport =
  | "milk_dispatch_record"
  | "milk_production"
  | "accountant_export"
  | "movement_log"
  | InspectorRegister;

/**
 * Every Export is an Audit Event, stamped with the report, the period it covers when it covers one, and the
 * Registration number (CONTEXT: Export). Nothing changes, so the write is the event alone; each Export is its
 * own entity, so the same report handed over twice is two Exports on the trail, not one Export seen twice.
 */
export const recordExport = (
  context: FarmContext,
  report: ExportedReport,
  period: { from: string; to: string } | null,
  extra: Record<string, unknown>
) =>
  audited(context).write(
    {
      entity: "report",
      entityId: newId(context.clock.now()),
      action: "export",
      after: {
        report,
        ...(period ? { from: period.from, to: period.to } : {}),
        registrationNumber: context.farm.registrationNumber,
        ...extra,
      },
    },
    () => Promise.resolve()
  );

/** The papers filed against the record they are about rather than under a period: an Animal's, and an
 *  Investor's. */
export type ExportedPaper =
  | "receipt"
  | "transport_card"
  | "passport"
  | "withdrawal_summary"
  | "agreement_draft"
  | "amendment_draft"
  | "template_preview"
  | "portal_consent"
  | "welcome_letter"
  | "code_slip"
  | "dls_letter"
  | "joining_letter"
  | "progress_statement"
  | "settlement_statement";

/**
 * What the trail records about a paper filed against its own record. The Registration number is part of it
 * because every Export is stamped with it (CONTEXT: Export), and because "which registration did that card
 * quote" is a question an inspector can ask years later — and "which Venture was that sheet about" is the
 * same question an Investor asks.
 *
 * One shape for all of them, because a second helper beside this one is a second answer to what an Export
 * snapshot holds.
 */
export const exportedPaper = (
  farm: { registrationNumber: string | null },
  paper: ExportedPaper,
  extra: Record<string, unknown> = {}
) => ({
  paper,
  registrationNumber: farm.registrationNumber,
  ...extra,
});

/** A paper the farm hands to somebody outside it carries the Registration number; a farm that has not written
 *  it down is told what is missing rather than handed a paper with a hole in it. */
export const assertRegistered = (
  farm: { registrationNumber: string | null },
  paper: string
) => {
  if (!farm.registrationNumber?.trim()) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The farm's DLS registration number is not recorded, and ${paper} cannot be written without it`,
      data: {
        refusal: "farm_identity_incomplete",
        missing: "registrationNumber",
      },
    });
  }
};
