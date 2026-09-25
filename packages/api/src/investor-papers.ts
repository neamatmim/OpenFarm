import {
  farmDayOf,
  joiningLetter,
  progressStatement,
  settlementStatement,
  termsOf,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";
import { assertRegistered, exportedPaper } from "./export-store";
import {
  assertCapitalHeld,
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
  shareOfUnits,
} from "./investor-statement-words";
import { paperValues } from "./paper-values";
import { languageOf } from "./reader-language";
import { wordingSignedIn } from "./template-store";
import { theirProgress } from "./venture-herd-store";

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
  const taka = (bdt: number) => formatNumber(bdt, language);
  const text = joiningLetter({
    farm: context.farm,
    him: standing.him,
    ventureName: standing.venture.name,
    unitPrice: taka(standing.venture.unitPriceBdt),
    units: formatNumber(standing.agreement.units, language),
    capital: standing.capital.map((one) => ({
      kind: one.kind,
      amount: taka(one.amountBdt),
      on: day(one.movedOn),
      reference: one.reference,
    })),
    totalCapital: taka(standing.capitalBdt),
    terms: termsOf(
      signedIn.content,
      paperValues({
        farm: context.farm,
        ownerName,
        him: standing.him,
        ventureName: standing.venture.name,
        units: standing.agreement.units,
        unitPriceBdt: standing.venture.unitPriceBdt,
        investorsPercent: standing.agreement.investorsPercent,
        windowStart: standing.agreement.targetWindowStart,
        windowEnd: standing.agreement.targetWindowEnd,
        windUpDays: context.farm.windUpDays,
        arbitrator: standing.agreement.arbitrator,
      })
    ),
    amendedOn: standing.agreement.amendedOn
      ? day(standing.agreement.amendedOn)
      : null,
    stamp: {
      kind: standing.agreement.stampKind,
      value: taka(standing.agreement.stampValueBdt),
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
        capitalBdt: standing.capitalBdt,
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
  const said = (value: number) => formatNumber(value, language);
  const text = progressStatement({
    farm: context.farm,
    investorName: standing.him.name,
    ventureName: standing.venture.name,
    units: said(standing.agreement.units),
    // His share of the Venture, which is his own Units over all of them — not a list of who holds
    // the rest, which is nobody's business but theirs.
    share: said(shareOfUnits(standing.agreement.units, spend.signedUnits)),
    standing: said(theirs.standingCount),
    sold: said(theirs.soldCount),
    died: said(theirs.diedCount),
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
      amount: said(one.bdt),
    })),
    spendTotal: said(spend.chargedBdt),
    budgets: {
      cattle: {
        planned: said(spend.cattleBudgetBdt),
        left: said(spend.cattleBudgetLeftBdt),
      },
      running: {
        planned: said(spend.runningBudgetBdt),
        spent: said(spend.runningSpentBdt),
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
        chargedBdt: spend.chargedBdt,
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
  const [settled, story] = await Promise.all([
    hisSettlement(context.db, context.farm.id, standing),
    theirHerdStory(context.db, context.farm.id, standing.venture.id),
  ]);
  if (!settled) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That Venture's Settlement has not been approved",
      data: { refusal: "not_settled_yet" },
    });
  }
  const said = (value: number) => formatNumber(value, language);
  // Unsigned, always: the label says which way it went, because a minus sign after the taka mark is
  // how a loss gets read as a small profit.
  const unsigned = (value: number) => said(Math.abs(value));
  const day = (on: string) =>
    formatDate(new Date(`${on}T00:00:00Z`), language, "date");
  // Capital returned, by the Units it returns to.
  const perUnitIn = settled.units > 0 ? settled.capitalBdt / settled.units : 0;
  const text = settlementStatement({
    farm: context.farm,
    investorName: standing.him.name,
    ventureName: standing.venture.name,
    approvedOn: formatDate(settled.approvedAt, language, "date"),
    proceeds: said(settled.proceedsBdt),
    charges: settled.charges.map((one) => ({
      label: chargeWords(one.word),
      amount: said(one.bdt),
    })),
    charged: said(settled.chargedBdt),
    result: unsigned(settled.profitBdt),
    inProfit: settled.profitBdt >= 0,
    investorsPercent: said(settled.investorsPercent),
    units: said(settled.units),
    perUnit: unsigned(settled.perUnitBdt),
    perUnitRose: settled.perUnitBdt >= 0,
    // What one Unit put in and what one Unit comes back with, which is the line he reads first.
    perUnitIn: said(perUnitIn),
    perUnitBack: said(perUnitIn + settled.perUnitBdt),
    rounding: said(settled.roundingBdt),
    farmShare: unsigned(settled.farmBdt),
    farmShareRose: settled.farmBdt >= 0,
    advance: settled.advanceBdt > 0 ? said(settled.advanceBdt) : null,
    advanceRepaid: settled.advanceRepaid,
    his: {
      units: said(settled.his.units),
      capital: said(settled.his.capitalBdt),
      share: unsigned(settled.his.shareBdt),
      shareRose: settled.his.shareBdt >= 0,
      payout: said(settled.his.payoutBdt),
      reference: settled.his.reference,
      paidOn: settled.his.paidOn ? day(settled.his.paidOn) : null,
    },
    herd: herdStoryWords(story, said),
    adjustments: settled.adjustments.map((one) => ({
      reason: one.reason,
      raisedAt: formatDate(one.raisedAt, language, "date"),
      outcome: adjustmentWords(one.outcome),
      amount: unsigned(one.differenceBdt),
      rose: one.differenceBdt >= 0,
      paid: said(one.paidBdt),
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
        payoutBdt: settled.his.payoutBdt,
        adjustments: settled.adjustments.length,
      }),
    },
    () => Promise.resolve()
  );
  return { text, agreementId: standing.agreement.id };
};
