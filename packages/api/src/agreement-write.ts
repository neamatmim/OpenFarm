import { investmentAgreement } from "@OpenFarm/db/schema/venture";
import type { StampKind } from "@OpenFarm/db/schema/venture";
import type { Nominee } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Trail, Tx } from "./audit";
import { countedInvestors, nextPayInCode, unitsTaken } from "./investor-store";
import { nominationBySigning } from "./nominations";
import { answerBySigning } from "./requests-to-join";
import { lockTheFarm, windowInForceOn } from "./venture-store";

/** What an Investment Agreement is written with, however it came to be agreed — on stamped paper or in the app. */
export interface AgreementToWrite {
  id: string;
  venture: {
    id: string;
    units: number;
    ordinal: number;
    targetWindowStart: string;
    targetWindowEnd: string;
  };
  investorId: string;
  units: number;
  investorsPercent: number;
  arbitrator: string;
  /** How its duty was paid, or that it was agreed in the app; the day, the taka and the paper's or the offer's number. */
  stamp: { kind: StampKind; valueBdt: number; on: string; serial: string };
  templateVersionId: string;
  /** The Request to Join it answers; left out, a Request the Investor had live reads signed all the same. */
  requestId?: string;
  /** The Nominees it names, already judged namable on its day. */
  nominees: readonly Nominee[];
}

/**
 * Writes one Investment Agreement inside a transaction already held, asking first everything signing asks: the Investor
 * not retired, not signed for this Venture already, the Request it answers, the Units left and the Investors the farm
 * may have. Every count is made behind a lock on the Farm row: the Units left, the Investors standing and the
 * Agreements that set the next Pay-in Code are only true until the next signature commits, and a rule that may not be
 * overridden may not be lost to two phones at once either. The Agreement is a Nomination too, for the Nominees it
 * names. Answers with the Pay-in Code it was given.
 *
 * One write for a paper signed and stamped and for an offer agreed in the app and approved: whatever the farm asks of
 * one, it asks of the other.
 */
export const writeAgreement = async (
  tx: Tx,
  trail: Trail,
  farm: { id: string; investorCap: number },
  by: { id: string; now: Date },
  agreement: AgreementToWrite
): Promise<string> => {
  const { venture } = agreement;
  await lockTheFarm(tx, farm.id);
  const signing = await tx.query.investor.findFirst({
    where: { id: agreement.investorId, farmId: farm.id },
    columns: { retiredAt: true },
  });
  if (signing?.retiredAt) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "This Investor is retired; bring them back before signing them for a Venture",
      data: { refusal: "investor_retired" },
    });
  }
  // One Agreement per person per Venture, as the unique index insists — said here in words, where the index would only
  // say "duplicate key".
  const already = await tx.query.investmentAgreement.findFirst({
    where: {
      farmId: farm.id,
      ventureId: venture.id,
      investorId: agreement.investorId,
    },
    columns: { id: true },
  });
  if (already) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Investor has signed for this Venture already",
      data: { refusal: "investor_already_signed" },
    });
  }
  // The Request it answers reads signed in this same transaction, or the signing is refused with it; with none named, a
  // Request they had live reads signed all the same.
  await answerBySigning(
    tx,
    trail,
    farm.id,
    {
      requestId: agreement.requestId,
      ventureId: venture.id,
      investorId: agreement.investorId,
    },
    by.now
  );
  const taken = await unitsTaken(tx, farm.id, venture.id);
  if (taken + agreement.units > venture.units) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Only ${venture.units - taken} Units of this Venture are left`,
      data: { refusal: "venture_units_gone" },
    });
  }
  const counted = await countedInvestors(tx, farm.id);
  const newcomer = !counted.unitsOf.has(agreement.investorId);
  if (newcomer && counted.standing >= farm.investorCap) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The farm may have ${farm.investorCap} Investors at a time`,
      data: { refusal: "investor_cap_reached" },
    });
  }
  const given = await nextPayInCode(tx, farm.id, venture);
  // As the Amendments the Investors before them signed have left it, not as the Venture opened.
  const window = await windowInForceOn(tx, farm.id, venture, farmDayOf(by.now));
  await tx.insert(investmentAgreement).values({
    id: agreement.id,
    farmId: farm.id,
    ventureId: venture.id,
    investorId: agreement.investorId,
    units: agreement.units,
    investorsPercent: agreement.investorsPercent,
    // The window the Venture means to sell in, as it stands today, written onto this paper.
    targetWindowStart: window.targetWindowStart,
    targetWindowEnd: window.targetWindowEnd,
    arbitrator: agreement.arbitrator,
    stampKind: agreement.stamp.kind,
    stampValueBdt: agreement.stamp.valueBdt,
    stampedOn: agreement.stamp.on,
    stampSerial: agreement.stamp.serial,
    templateVersionId: agreement.templateVersionId,
    payInCode: given,
    requestId: agreement.requestId ?? null,
    signedBy: by.id,
    createdAt: by.now,
  });
  await nominationBySigning(tx, trail, {
    farmId: farm.id,
    investorId: agreement.investorId,
    agreementId: agreement.id,
    signedOn: agreement.stamp.on,
    nominees: agreement.nominees,
    recordedBy: by.id,
    now: by.now,
  });
  return given;
};
