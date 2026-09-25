import { farmDayOf, maskedDigits } from "@OpenFarm/domain";

import type { Context } from "./context";
import { howToPay } from "./how-to-pay";
import type { PaperMaking } from "./investor-papers";
import {
  joiningLetterFor,
  progressStatementFor,
  settlementStatementFor,
} from "./investor-papers";
import {
  hisStanding,
  theVentureOf,
  theirSpend,
} from "./investor-statement-store";
import { shareOfUnits } from "./investor-statement-words";
import { ownerNameOf, requireTheirs } from "./portal-store";
import { theirProgress } from "./venture-herd-store";

// What one Investor reads in the portal, page by page. Asked for by the Investor from their own sign-in, or by the
// Owner's Portal Preview for them: the answer is the same either way, so there is one of each, and neither marks
// anything read.

/** Whose portal is being read, on which farm, and when. */
export interface PortalReader {
  db: Context["db"];
  clock: Context["clock"];
  farm: NonNullable<Context["farm"]>;
  investor: { id: string; name: string; phone: string };
}

/**
 * Who the portal is for, which farm's and how to reach it, and their own record as the farm holds it — the NID and
 * the bank account with all but their last digits hidden, enough to know them by on a screen somebody may be looking
 * over. They are put right by the Owner, not in the portal.
 */
export const theirRecord = async ({ db, farm, investor }: PortalReader) => {
  const theirs = await db.query.investor.findFirst({
    where: { id: investor.id, farmId: farm.id },
  });
  return {
    investorId: investor.id,
    name: investor.name,
    farm: { name: farm.name, phone: farm.phone, address: farm.address },
    record: {
      phone: theirs?.phone ?? investor.phone,
      address: theirs?.address ?? null,
      nid: theirs?.nid ? maskedDigits(theirs.nid) : null,
      bankAccount: theirs?.bankAccount
        ? maskedDigits(theirs.bankAccount)
        : null,
      nominee: theirs?.nomineeName
        ? {
            name: theirs.nomineeName,
            relation: theirs.nomineeRelation,
            phone: theirs.nomineePhone,
          }
        : null,
    },
  };
};

/**
 * One of their Ventures as it stands today, to draw rather than print: their part of it, how the animals are doing,
 * where the Venture's money has gone and what is left of its budgets. The same figures the progress statement says,
 * and no projection — days are counted, weights are read, nothing is forecast. Refused for an Agreement not theirs.
 */
export const theirVentureToday = async (
  { db, clock, farm, investor }: PortalReader,
  agreementId: string
) => {
  await requireTheirs(db, farm.id, investor.id, agreementId);
  const now = clock.now();
  const standing = await hisStanding(db, farm.id, agreementId, farmDayOf(now));
  const run = await theVentureOf(db, farm.id, standing.venture.id);
  const [theirs, spend, paying] = await Promise.all([
    theirProgress(db, farm.id, run, now),
    theirSpend(db, farm.id, run),
    howToPay(db, farm.id, agreementId, run),
  ]);
  return {
    agreementId,
    venture: { name: standing.venture.name, state: run.state },
    his: {
      units: standing.agreement.units,
      sharePercent: shareOfUnits(standing.agreement.units, spend.signedUnits),
      capitalBdt: standing.capitalBdt,
      investorsPercent: standing.agreement.investorsPercent,
      amendedOn: standing.agreement.amendedOn,
    },
    window: {
      start: standing.agreement.targetWindowStart,
      end: standing.agreement.targetWindowEnd,
      daysTo: theirs.daysToWindow,
    },
    herd: {
      standing: theirs.standingCount,
      sold: theirs.soldCount,
      died: theirs.diedCount,
      weighed: theirs.weighedCount,
      averageIntakeKg: theirs.averageIntakeKg,
      averageLatestKg: theirs.averageLatestKg,
      gainKgPerDay: theirs.gainKgPerDay,
      animals: theirs.animals
        .filter((one) => one.standing)
        .map((one) => ({
          tagNumber: one.tagNumber,
          intakeKg: one.intakeKg,
          latestKg: one.latestKg,
          dailyGainKg: one.dailyGainKg,
        })),
    },
    spend: {
      charges: spend.charges.map((one) => ({ word: one.word, bdt: one.bdt })),
      chargedBdt: spend.chargedBdt,
      cattleBudgetBdt: spend.cattleBudgetBdt,
      cattleBudgetLeftBdt: spend.cattleBudgetLeftBdt,
      runningBudgetBdt: spend.runningBudgetBdt,
      runningSpentBdt: spend.runningSpentBdt,
    },
    /** Where to pay and how much is left, while their capital is still owed; nothing once it is all in. */
    howToPay: paying,
  };
};

/** The three papers the portal shows an Investor. */
export type PortalPaperKind = "joining" | "progress" | "settlement";

/**
 * One of their own papers, as the Owner would print it: the joining letter, the progress statement, or — once the
 * Settlement is approved — the settlement statement. An Export in the trail, attributed to whoever `making` names:
 * the Investor in the portal, the Owner in the Preview.
 */
export const theirPaper = async (
  making: PaperMaking,
  investorId: string,
  agreementId: string,
  kind: PortalPaperKind
) => {
  await requireTheirs(making.db, making.farm.id, investorId, agreementId);
  if (kind === "joining") {
    const { text } = await joiningLetterFor(
      making,
      agreementId,
      await ownerNameOf(making.db, making.farm.id)
    );
    return { text, photos: [] };
  }
  if (kind === "progress") {
    const { text, photos } = await progressStatementFor(making, agreementId);
    return { text, photos };
  }
  const { text } = await settlementStatementFor(making, agreementId);
  return { text, photos: [] };
};
