import {
  farmDayOf,
  joiningLetterPaper,
  progressStatementPaper,
  roundMoney,
  settlementStatementPaper,
  sumsStandingOf,
  termsSaid,
  wordingFor,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";
import { assertRegistered, exportedPaper } from "./export-store";
import { farmUnitsOf } from "./farm-capital-store";
import {
  assertCapitalHeld,
  hisHolding,
  hisSettlement,
  hisStanding,
  theVentureOf,
  theirHerdStory,
  theirPhotographs,
  theirSpend,
} from "./investor-statement-store";
import {
  adjustmentWords,
  chargeWords,
  gainWords,
  herdStoryWords,
} from "./investor-statement-words";
import { madeOn, paperValues } from "./paper-values";
import { agreementReturnOnCapital } from "./returns-store";
import { wordingSignedIn } from "./template-store";
import { theirProgress } from "./venture-herd-store";
import { windUpDaysOf, paidForBy } from "./venture-store";

/** What making one of an Investor's papers needs: the farm it comes from, whoever is asking for it — the Owner
 *  printing it, or the Investor reading it in the portal (ADR 0007) — and the clock. Every paper made is an Export
 *  in the trail, attributed to whoever asked. `inPreviewOf` names the Investor whose portal the Owner was reading
 *  when they made it, so the trail says why the Owner made it there. */
export type PaperMaking = Parameters<typeof audited>[0] & {
  farm: NonNullable<Context["farm"]>;
  actor: { id: string; name: string };
  inPreviewOf?: string;
};

/** Where a paper was made, as its Export records it: in an Investor's Portal Preview, or nothing to say. */
const madeIn = (context: PaperMaking) =>
  context.inPreviewOf ? { inPreviewOf: context.inPreviewOf } : {};

/**
 * Where they stand against their Monthly Sums, for the progress statement to say in the words the advisers approved:
 * how many of how many are paid, what is missed, and the next still to pay. Nothing for a Venture paid before buying, or
 * one still gathering its capital.
 */
const sumsStanding = (
  venture: Parameters<typeof paidForBy>[0] & { state: string },
  his: { units: number; capitalMoney: number },
  today: string
) => {
  const { monthly } = paidForBy(venture);
  if (!monthly || venture.state === "open") {
    return null;
  }
  const standing = sumsStandingOf({
    units: his.units,
    unitPriceMoney: venture.unitPriceMoney,
    monthly,
    paidMoney: his.capitalMoney,
    today,
  });
  return {
    sums: standing.sums,
    sumsPaid: standing.sumsPaid,
    missedMoney: standing.missedMoney,
    next: standing.next
      ? { dueOn: standing.next.dueOn, amountMoney: standing.next.amount }
      : null,
  };
};

/**
 * যোগদানপত্র for one Agreement: that the Farm has his money, how much, on what day and by which bank reference, and
 * the terms of the wording his Agreement was signed in, filled from what is in force today. `ownerName` is who signs
 * for the Farm, which is the Owner's name whoever is asking for the paper.
 */
export const joiningLetterFor = async (
  context: PaperMaking,
  agreementId: string,
  ownerName: string
) => {
  assertRegistered(context.farm, "an investor's joining letter");
  const now = context.clock.now();
  const standing = await hisStanding(
    context.db,
    context.farm.id,
    agreementId,
    farmDayOf(now)
  );
  assertCapitalHeld(standing);
  // What he agreed to, in the words he signed: the Version his Agreement was signed in, filled from the terms in
  // force today.
  const signedIn = await wordingSignedIn(
    context.db,
    context.farm.id,
    standing.agreement
  );
  // Paid by the month: the clauses it was signed with, and their Units' schedule under what they have paid.
  const { monthly } = paidForBy(standing.venture);
  // The Farm's own Units in their Venture, as their Agreement told them before they signed.
  const farmUnits = await farmUnitsOf(
    context.db,
    context.farm.id,
    standing.venture.id
  );
  const farmCapital =
    farmUnits > 0 ? { farmUnits, ventureUnits: standing.venture.units } : null;
  const document = joiningLetterPaper({
    farm: context.farm,
    him: standing.him,
    ventureName: standing.venture.name,
    unitPriceMoney: standing.venture.unitPriceMoney,
    units: standing.agreement.units,
    capital: standing.capital.map((one) => ({
      kind: one.kind,
      amountMoney: one.amountMoney,
      movedOn: one.movedOn,
      reference: one.reference,
    })),
    totalCapitalMoney: standing.capitalMoney,
    monthlySums: monthly
      ? monthly.sums.map((one) => ({
          dueOn: one.dueOn,
          amountMoney: one.amount * standing.agreement.units,
        }))
      : null,
    terms: termsSaid(
      wordingFor(signedIn.content, {
        paidByTheMonth: monthly !== null,
        farmCapital: farmCapital !== null,
        organization: standing.him.organization !== null,
      }),
      paperValues({
        farm: context.farm,
        ownerName,
        him: standing.him,
        ventureName: standing.venture.name,
        units: standing.agreement.units,
        unitPriceMoney: standing.venture.unitPriceMoney,
        investorsPercent: standing.agreement.investorsPercent,
        windowStart: standing.agreement.targetWindowStart,
        windowEnd: standing.agreement.targetWindowEnd,
        windUpDays: windUpDaysOf(standing.venture, context.farm),
        arbitrator: standing.agreement.arbitrator,
        monthly,
        farmCapital,
      })
    ),
    amendedOn: standing.agreement.amendedOn,
    stamp: {
      kind: standing.agreement.stampKind,
      valueMoney: standing.agreement.stampValueMoney,
      on: standing.agreement.stampedOn,
      serial: standing.agreement.stampSerial,
    },
    ownerName,
    producedBy: context.actor.name,
    producedAt: madeOn(now),
  });
  await audited(context).write(
    {
      // Filed against the Agreement, which is what the paper is about: one man, one Venture, one set
      // of terms. "What did we send that man, and when" is then a question the trail answers.
      entity: "investment_agreement",
      entityId: standing.agreement.id,
      action: "export",
      after: exportedPaper(context.farm, "joining_letter", {
        ...madeIn(context),
        ventureId: standing.venture.id,
        investorId: standing.him.id,
        movements: standing.capital.length,
        capitalMoney: standing.capitalMoney,
      }),
    },
    () => Promise.resolve()
  );
  return { document, agreementId: standing.agreement.id };
};

/** অগ্রগতি for one Agreement: how his animals are doing, where the Venture's money has gone, and their photographs. */
export const progressStatementFor = async (
  context: PaperMaking,
  agreementId: string
) => {
  assertRegistered(context.farm, "an investor's progress statement");
  const now = context.clock.now();
  const standing = await hisStanding(
    context.db,
    context.farm.id,
    agreementId,
    farmDayOf(now)
  );
  const venture = await theVentureOf(
    context.db,
    context.farm.id,
    standing.venture.id
  );
  const [theirs, spend] = await Promise.all([
    theirProgress(context.db, context.farm.id, venture, now),
    theirSpend(context.db, context.farm.id, venture),
  ]);
  const holding = hisHolding(
    { units: standing.agreement.units, capitalMoney: standing.capitalMoney },
    spend,
    venture
  );
  const farmUnits = await farmUnitsOf(
    context.db,
    context.farm.id,
    standing.venture.id
  );
  const document = progressStatementPaper({
    farm: context.farm,
    investorName: standing.him.name,
    ventureName: standing.venture.name,
    monthlySums: sumsStanding(
      standing.venture,
      { units: standing.agreement.units, capitalMoney: standing.capitalMoney },
      farmDayOf(now)
    ),
    // Their Units and their share of the Venture, which is their own Units over all of them — not a list of who holds
    // the rest, which is nobody's business but theirs. Held, not signed for, once the buying has started.
    units: holding.units,
    sharePercent: holding.sharePercent,
    // The Farm's own Units are no other Investor's business kept from them: their Agreement named them before they
    // signed.
    farmUnits:
      farmUnits > 0
        ? { units: farmUnits, ventureUnits: standing.venture.units }
        : null,
    standing: theirs.standingCount,
    sold: theirs.soldCount,
    died: theirs.diedCount,
    lost: theirs.lostCount,
    weighed: theirs.weighedCount,
    averageIntakeKg: theirs.averageIntakeKg,
    averageLatestKg: theirs.averageLatestKg,
    herdGainKgPerDay: theirs.gainKgPerDay,
    daysToWindow: theirs.daysToWindow,
    animals: theirs.animals
      .filter((one) => one.standing)
      .map((one) => ({
        tagNumber: one.tagNumber,
        intakeKg: one.intakeKg,
        latestKg: one.latestKg,
        gain: gainWords(one.dailyGainKg, one.overDays),
      })),
    spend: spend.charges.map((one) => ({
      label: chargeWords(one.word),
      amountMoney: one.amount,
    })),
    spendTotalMoney: spend.chargedMoney,
    budgets: {
      cattle: {
        plannedMoney: spend.cattleBudgetMoney,
        leftMoney: spend.cattleBudgetLeftMoney,
      },
      running: {
        plannedMoney: spend.runningBudgetMoney,
        spentMoney: spend.runningSpentMoney,
      },
    },
    producedBy: context.actor.name,
    producedAt: madeOn(now),
  });
  const photos = await theirPhotographs(
    context.db,
    context.farm.id,
    theirs.animals.filter((one) => one.standing && one.hasPhoto)
  );
  await audited(context).write(
    {
      entity: "investment_agreement",
      entityId: standing.agreement.id,
      action: "export",
      after: exportedPaper(context.farm, "progress_statement", {
        ...madeIn(context),
        ventureId: standing.venture.id,
        investorId: standing.him.id,
        standing: theirs.standingCount,
        chargedMoney: spend.chargedMoney,
      }),
    },
    () => Promise.resolve()
  );
  return { document, photos, agreementId: standing.agreement.id };
};

/** হিসাব নিকাশ for one Agreement: the figures approval froze, his own payout, and any Adjustment since. */
export const settlementStatementFor = async (
  context: PaperMaking,
  agreementId: string
) => {
  assertRegistered(context.farm, "an investor's settlement statement");
  const now = context.clock.now();
  const standing = await hisStanding(
    context.db,
    context.farm.id,
    agreementId,
    farmDayOf(now)
  );
  const [settled, story, onCapital] = await Promise.all([
    hisSettlement(context.db, context.farm.id, standing),
    theirHerdStory(context.db, context.farm.id, standing.venture.id),
    // Printed once the Owner shows it to Investors, a paper being theirs to keep — and in the Owner's Portal Preview
    // either way, so its wording is read before anybody else reads it (ADR 0012).
    context.farm.investorReturns || context.inPreviewOf !== undefined
      ? agreementReturnOnCapital(context.db, context.farm.id, agreementId)
      : null,
  ]);
  if (!settled) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That Venture's Settlement has not been approved",
      data: { refusal: "not_settled_yet" },
    });
  }
  // Capital returned, by the Units it returns to.
  const perUnitInMoney =
    settled.units > 0 ? settled.capitalMoney / settled.units : 0;
  const monthlyVenture = paidForBy(standing.venture).monthly !== null;
  const unpaidMoney = roundMoney(
    standing.agreement.units * standing.venture.unitPriceMoney -
      settled.his.capitalMoney
  );
  const document = settlementStatementPaper({
    farm: context.farm,
    investorName: standing.him.name,
    ventureName: standing.venture.name,
    approvedOn: farmDayOf(settled.approvedAt),
    proceedsMoney: settled.proceedsMoney,
    charges: settled.charges.map((one) => ({
      label: chargeWords(one.word),
      amountMoney: one.amount,
    })),
    chargedMoney: settled.chargedMoney,
    profitMoney: settled.profitMoney,
    investorsPercent: settled.investorsPercent,
    units: settled.units,
    perUnitMoney: settled.perUnitMoney,
    // What one Unit put in, beside which the paper says what it came back with: the line they read first.
    perUnitInMoney,
    roundingMoney: settled.roundingMoney,
    farmMoney: settled.farmMoney,
    advance:
      settled.advanceMoney > 0
        ? { amountMoney: settled.advanceMoney, repaid: settled.advanceRepaid }
        : null,
    his: {
      units: settled.his.units,
      // Paid by the month: what they signed for beside what they held, and what of their Monthly Sums never came — only
      // where they differ, which on a Venture paid in full they do not.
      signedUnits:
        monthlyVenture && settled.his.units !== standing.agreement.units
          ? standing.agreement.units
          : null,
      sumsUnpaidMoney: monthlyVenture && unpaidMoney > 0 ? unpaidMoney : null,
      capitalMoney: settled.his.capitalMoney,
      shareMoney: settled.his.shareMoney,
      payoutMoney: settled.his.payoutMoney,
      reference: settled.his.reference,
      paidOn: settled.his.paidOn,
    },
    onCapital: onCapital
      ? { per100: onCapital.per100, days: onCapital.days }
      : null,
    herd: herdStoryWords(story),
    adjustments: settled.adjustments.map((one) => ({
      reason: one.reason,
      raisedOn: farmDayOf(one.raisedAt),
      outcome: adjustmentWords(one.outcome),
      differenceMoney: one.differenceMoney,
      paidMoney: one.paidMoney,
    })),
    producedBy: context.actor.name,
    producedAt: madeOn(now),
  });
  await audited(context).write(
    {
      entity: "investment_agreement",
      entityId: standing.agreement.id,
      action: "export",
      after: exportedPaper(context.farm, "settlement_statement", {
        ...madeIn(context),
        ventureId: standing.venture.id,
        investorId: standing.him.id,
        payoutMoney: settled.his.payoutMoney,
        adjustments: settled.adjustments.length,
      }),
    },
    () => Promise.resolve()
  );
  return { document, agreementId: standing.agreement.id };
};
