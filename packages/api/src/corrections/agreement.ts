import { eq } from "@OpenFarm/db/operators";
import { investmentAgreement } from "@OpenFarm/db/schema/venture";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { farmDay } from "../farm-clock";
import { readAgreement, unitsTaken } from "../investor-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const refuse = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** An Agreement nothing has been paid on: once capital is taken on it, the paper is what the money rests on. */
const loadAgreement = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.investmentAgreement.findFirst({
    where: { id, farmId },
  });
  if (!row) {
    return row;
  }
  const paid = await tx.query.ventureMovement.findFirst({
    where: { farmId, agreementId: id, kind: "capital_in" },
    columns: { id: true },
  });
  if (paid) {
    throw refuse(
      "Capital has been taken on this Agreement; what it says is what the money rests on",
      "capital_taken_on_it"
    );
  }
  return row;
};

/** What was typed against the stamped paper and may be put right before any capital is taken on it: the Units, the
 *  stamp's value, day and serial, and the Arbitrator. The split and the window are an Amendment's. */
export const agreementCorrectionInput = correctionInput({
  units: changeOf(z.number().int().positive().max(10_000), z.number()),
  stampValueMoney: changeOf(z.number().positive().max(1_000_000), z.number()),
  stampedOn: changeOf(farmDay, z.string()),
  stampSerial: changeOf(z.string().trim().min(1).max(60), z.string()),
  arbitrator: changeOf(z.string().trim().min(1).max(120), z.string()),
});

/**
 * An Investment Agreement put right against the stamped paper by the Owner, until capital is taken on it (the Owner's
 * default, 2026-10-07): 2 Units typed for 20, a serial mistyped, could only be undone by calling off the whole Venture,
 * every Investor's money with it. Its Units are held to what the Venture has left, as signing held them.
 */
export const agreementCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadAgreement>>>,
  z.infer<typeof agreementCorrectionInput>["changes"]
> = {
  entity: "investment_agreement",
  table: investmentAgreement,
  roles: ["owner"],
  missing: "No such agreement",
  load: loadAgreement,
  entry: null,
  shown: (_tx, row) =>
    Promise.resolve({
      units: row.units,
      stampValueMoney: row.stampValueMoney,
      stampedOn: row.stampedOn,
      stampSerial: row.stampSerial,
      arbitrator: row.arbitrator,
    }),
  trail: (tx, row) => readAgreement(tx, row.farmId, row.id),
  apply: async (tx, row, to) => {
    if (to.units !== undefined) {
      const venture = await tx.query.venture.findFirst({
        where: { id: row.ventureId, farmId: row.farmId },
        columns: { id: true, units: true },
      });
      const taken = await unitsTaken(tx, row.farmId, row.ventureId);
      if (venture && taken - row.units + to.units > venture.units) {
        throw refuse(
          `Only ${venture.units - taken + row.units} Units of this Venture are left`,
          "venture_units_gone"
        );
      }
    }
    const putRight = {
      ...(to.units === undefined ? {} : { units: to.units }),
      ...(to.stampValueMoney === undefined
        ? {}
        : { stampValueMoney: to.stampValueMoney }),
      ...(to.stampedOn === undefined ? {} : { stampedOn: to.stampedOn }),
      ...(to.stampSerial === undefined ? {} : { stampSerial: to.stampSerial }),
      ...(to.arbitrator === undefined ? {} : { arbitrator: to.arbitrator }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(investmentAgreement)
        .set(putRight)
        .where(eq(investmentAgreement.id, row.id));
    }
  },
};
