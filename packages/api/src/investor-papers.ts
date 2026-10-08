import {
  farmDayOf,
  joiningLetter,
  progressStatement,
  roundMoney,
  settlementStatement,
  sumsStandingOf,
  termsOf,
  wordingFor,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
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
import { paperValues } from "./paper-values";
import { languageOf } from "./reader-language";
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

/** A figure in Bangla numerals, for a Bangla sentence whoever reads it. */
const bn = (value: number) => formatNumber(value, "bn");

/** A figure for a line said twice, in Bangla and then in English: each half in its own numerals. */
const bothHalves = (value: number) => ({
  bn: bn(value),
  en: formatNumber(value, "en"),
});

/**
 * Where he stands against his Monthly Sums, as the progress statement says it in the words the advisers approved —
 * a Bangla sentence, so in Bangla numerals whoever reads it: "৪ মাসের ২টি দেওয়া · বাকি পড়েছে ৫,০০০ টাকা · পরেরটি
 * ১০ এপ্রিল, ২০৭৬, ২,৫০০ টাকা", the last two only where they apply. Nothing for a Venture paid before buying, or one
 * still gathering its capital.
 */
const sumsSaid = (
  venture: Parameters<typeof paidForBy>[0] & { state: string },
  his: { units: number; capitalMoney: number },
  today: string
): string | null => {
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
  const parts = [`${bn(standing.sums)} মাসের ${bn(standing.sumsPaid)}টি দেওয়া`];
  if (standing.missedMoney > 0) {
    parts.push(`বাকি পড়েছে ${bn(standing.missedMoney)} টাকা`);
  }
  if (standing.next) {
    parts.push(
      `পরেরটি ${formatDate(new Date(`${standing.next.dueOn}T00:00:00Z`), "bn", "date")}, ${bn(standing.next.amount)} টাকা`
    );
  }
  return parts.join(" · ");
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
  const language = await languageOf(context.db, context.actor.id);
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
  const day = (on: string) =>
    formatDate(new Date(`${on}T00:00:00Z`), language, "date");
  // Beside টাকা on the letter: Bangla numerals, whoever reads it.
  const asMoney = bn;
  // Paid by the month: the clauses it was signed with, and his Units' schedule under what he has paid.
  const { monthly } = paidForBy(standing.venture);
  // The Farm's own Units in his Venture, as his Agreement told him before he signed.
  const farmUnits = await farmUnitsOf(
    context.db,
    context.farm.id,
    standing.venture.id
  );
  const farmCapital =
    farmUnits > 0 ? { farmUnits, ventureUnits: standing.venture.units } : null;
  const text = joiningLetter({
    farm: context.farm,
    him: standing.him,
    ventureName: standing.venture.name,
    unitPrice: asMoney(standing.venture.unitPriceMoney),
    units: bn(standing.agreement.units),
    capital: standing.capital.map((one) => ({
      kind: one.kind,
      amount: asMoney(one.amountMoney),
      on: day(one.movedOn),
      reference: one.reference,
    })),
    totalCapital: asMoney(standing.capitalMoney),
    monthlySums: monthly
      ? monthly.sums.map((one) => ({
          on: day(one.dueOn),
          amount: asMoney(one.amount * standing.agreement.units),
        }))
      : null,
    terms: termsOf(
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
    amendedOn: standing.agreement.amendedOn
      ? day(standing.agreement.amendedOn)
      : null,
    stamp: {
      kind: standing.agreement.stampKind,
      value: asMoney(standing.agreement.stampValueMoney),
      on: day(standing.agreement.stampedOn),
      serial: standing.agreement.stampSerial,
    },
    producedBy: context.actor.name,
    producedAt: formatDate(now, language, "dateTime"),
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
  return { text, agreementId: standing.agreement.id };
};

/** অগ্রগতি for one Agreement: how his animals are doing, where the Venture's money has gone, and their photographs. */
export const progressStatementFor = async (
  context: PaperMaking,
  agreementId: string
) => {
  assertRegistered(context.farm, "an investor's progress statement");
  const now = context.clock.now();
  const language = await languageOf(context.db, context.actor.id);
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
  // Every figure here stands beside a Bangla word — টাকা, কেজি, দিন — so in Bangla numerals, whoever reads it.
  const said = bn;
  const farmUnits = await farmUnitsOf(
    context.db,
    context.farm.id,
    standing.venture.id
  );
  const text = progressStatement({
    farm: context.farm,
    investorName: standing.him.name,
    ventureName: standing.venture.name,
    monthlySums: sumsSaid(
      standing.venture,
      { units: standing.agreement.units, capitalMoney: standing.capitalMoney },
      farmDayOf(now)
    ),
    // His Units and his share of the Venture, which is his own Units over all of them — not a list of who holds the
    // rest, which is nobody's business but theirs. Held, not signed for, once the buying has started.
    units: said(holding.units),
    share: said(holding.sharePercent),
    // The Farm's own Units are no other Investor's business kept from him: his Agreement named them before he signed.
    farmUnits:
      farmUnits > 0
        ? `${said(farmUnits)} / ${said(standing.venture.units)}`
        : null,
    standing: said(theirs.standingCount),
    sold: said(theirs.soldCount),
    died: said(theirs.diedCount),
    lost: theirs.lostCount > 0 ? said(theirs.lostCount) : null,
    weighed: said(theirs.weighedCount),
    averageIntake:
      theirs.averageIntakeKg === null ? null : said(theirs.averageIntakeKg),
    averageLatest:
      theirs.averageLatestKg === null ? null : said(theirs.averageLatestKg),
    herdGain: theirs.gainKgPerDay === null ? null : said(theirs.gainKgPerDay),
    daysToWindow: said(theirs.daysToWindow),
    animals: theirs.animals
      .filter((one) => one.standing)
      .map((one) => ({
        tagNumber: one.tagNumber,
        intake: one.intakeKg === null ? "—" : said(one.intakeKg),
        latest: one.latestKg === null ? "—" : said(one.latestKg),
        gain: gainWords(one.dailyGainKg, one.overDays, said),
      })),
    spend: spend.charges.map((one) => ({
      label: chargeWords(one.word),
      amount: said(one.amount),
    })),
    spendTotal: said(spend.chargedMoney),
    budgets: {
      cattle: {
        planned: said(spend.cattleBudgetMoney),
        left: said(spend.cattleBudgetLeftMoney),
      },
      running: {
        planned: said(spend.runningBudgetMoney),
        spent: said(spend.runningSpentMoney),
      },
    },
    producedBy: context.actor.name,
    producedAt: formatDate(now, language, "dateTime"),
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
  return { text, photos, agreementId: standing.agreement.id };
};

/** হিসাব নিকাশ for one Agreement: the figures approval froze, his own payout, and any Adjustment since. */
export const settlementStatementFor = async (
  context: PaperMaking,
  agreementId: string
) => {
  assertRegistered(context.farm, "an investor's settlement statement");
  const now = context.clock.now();
  const language = await languageOf(context.db, context.actor.id);
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
  // Every figure here stands beside a Bangla word — টাকা, কেজি, দিন — so in Bangla numerals, whoever reads it.
  const said = bn;
  // Unsigned, always: the label says which way it went, because a minus sign after the taka mark is
  // how a loss gets read as a small profit.
  const unsigned = (value: number) => said(Math.abs(value));
  const day = (on: string) =>
    formatDate(new Date(`${on}T00:00:00Z`), language, "date");
  // Capital returned, by the Units it returns to.
  const perUnitIn =
    settled.units > 0 ? settled.capitalMoney / settled.units : 0;
  const monthlyVenture = paidForBy(standing.venture).monthly !== null;
  const unpaidMoney = roundMoney(
    standing.agreement.units * standing.venture.unitPriceMoney -
      settled.his.capitalMoney
  );
  const text = settlementStatement({
    farm: context.farm,
    investorName: standing.him.name,
    ventureName: standing.venture.name,
    approvedOn: formatDate(settled.approvedAt, language, "date"),
    proceeds: said(settled.proceedsMoney),
    charges: settled.charges.map((one) => ({
      label: chargeWords(one.word),
      amount: said(one.amount),
    })),
    charged: said(settled.chargedMoney),
    result: unsigned(settled.profitMoney),
    inProfit: settled.profitMoney >= 0,
    investorsPercent: said(settled.investorsPercent),
    units: said(settled.units),
    perUnit: unsigned(settled.perUnitMoney),
    perUnitRose: settled.perUnitMoney >= 0,
    // What one Unit put in and what one Unit comes back with, which is the line he reads first.
    perUnitIn: bothHalves(perUnitIn),
    perUnitBack: bothHalves(perUnitIn + settled.perUnitMoney),
    rounding: said(settled.roundingMoney),
    farmShare: unsigned(settled.farmMoney),
    farmShareRose: settled.farmMoney >= 0,
    advance: settled.advanceMoney > 0 ? said(settled.advanceMoney) : null,
    advanceRepaid: settled.advanceRepaid,
    his: {
      units: said(settled.his.units),
      // Paid by the month: what he signed for beside what he held, and what of his Monthly Sums never came — only where
      // they differ, which on a Venture paid in full they do not.
      signedUnits:
        monthlyVenture && settled.his.units !== standing.agreement.units
          ? said(standing.agreement.units)
          : null,
      sumsUnpaid: monthlyVenture && unpaidMoney > 0 ? said(unpaidMoney) : null,
      capital: said(settled.his.capitalMoney),
      share: unsigned(settled.his.shareMoney),
      shareRose: settled.his.shareMoney >= 0,
      payout: said(settled.his.payoutMoney),
      reference: settled.his.reference,
      paidOn: settled.his.paidOn ? day(settled.his.paidOn) : null,
    },
    onCapital: onCapital
      ? {
          per100: bothHalves(Math.abs(onCapital.per100)),
          days: bothHalves(onCapital.days),
          rose: onCapital.per100 >= 0,
        }
      : null,
    herd: herdStoryWords(story, said),
    adjustments: settled.adjustments.map((one) => ({
      reason: one.reason,
      raisedAt: formatDate(one.raisedAt, language, "date"),
      outcome: adjustmentWords(one.outcome),
      amount: unsigned(one.differenceMoney),
      rose: one.differenceMoney >= 0,
      paid: said(one.paidMoney),
    })),
    producedBy: context.actor.name,
    producedAt: formatDate(now, language, "dateTime"),
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
  return { text, agreementId: standing.agreement.id };
};
