import {
  farmDayOf,
  investmentAgreementDraft,
  joiningLetter,
  progressStatement,
  settlementStatement,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { assertRegistered, exportedPaper } from "../export-store";
import { protectedProcedure } from "../index";
import {
  assertCapitalHeld,
  hisSettlement,
  hisStanding,
  theVentureOf,
  theirHerdStory,
  theirPhotographs,
  theirSpend,
} from "../investor-statement-store";
import {
  adjustmentWords,
  agreementTerms,
  chargeWords,
  gainWords,
  herdStoryWords,
  joiningTerms,
  shareOfUnits,
} from "../investor-statement-words";
import { languageOf } from "../reader-language";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import { theirProgress } from "../venture-herd-store";

export const investorStatementsRouter = {
  /**
   * মুদারাবা বিনিয়োগ চুক্তি — the Investment Agreement for one Investor and one Venture, printed from the terms the
   * Owner is about to sign on: onto stamp paper, or to go with an e-challan. Nothing is written but the trail's line:
   * the Agreement exists once it is signed, stamped and entered.
   *
   * The Owner's alone, from her own phone, as signing is. The target window is the Venture's, as signing copies it.
   */
  agreementDraft: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        investorId: z.string(),
        units: z.number().int().min(1).max(10_000),
        investorsPercent: z.number().int().min(0).max(100),
        arbitrator: z.string().trim().min(1).max(200),
      })
    )
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "an Investment Agreement");
      const [run, him] = await Promise.all([
        context.db.query.venture.findFirst({
          where: { id: input.ventureId, farmId: context.farm.id },
          columns: {
            id: true,
            name: true,
            state: true,
            unitPriceBdt: true,
            targetWindowStart: true,
            targetWindowEnd: true,
          },
        }),
        context.db.query.investor.findFirst({
          where: { id: input.investorId, farmId: context.farm.id },
        }),
      ]);
      if (!(run && him)) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such Venture or Investor",
        });
      }
      if (run.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes signatures only while it is open",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const taka = (bdt: number) => formatNumber(bdt, language);
      const text = investmentAgreementDraft({
        farm: context.farm,
        ownerName: context.actor.name,
        him: {
          name: him.name,
          phone: him.phone,
          address: him.address,
          nid: him.nid,
          nominee: him.nomineeName
            ? {
                name: him.nomineeName,
                phone: him.nomineePhone,
                relation: him.nomineeRelation,
              }
            : null,
        },
        ventureName: run.name,
        unitPrice: taka(run.unitPriceBdt),
        units: formatNumber(input.units, language),
        capital: taka(input.units * run.unitPriceBdt),
        terms: agreementTerms(
          {
            investorsPercent: input.investorsPercent,
            targetWindowStart: run.targetWindowStart,
            targetWindowEnd: run.targetWindowEnd,
            arbitrator: input.arbitrator,
          },
          context.farm.windUpDays
        ),
        producedBy: context.actor.name,
        producedAt: formatDate(now, language, "dateTime"),
      });
      await audited(context).write(
        {
          // Filed against the Venture: there is no Agreement yet to file it against, and "what did we hand that man
          // to sign, and when" is a question about the Venture he was signing for.
          entity: "venture",
          entityId: run.id,
          action: "export",
          after: exportedPaper(context.farm, "agreement_draft", {
            investorId: him.id,
            units: input.units,
            investorsPercent: input.investorsPercent,
          }),
        },
        () => Promise.resolve()
      );
      return { text };
    }),

  /**
   * যোগদানপত্র — the paper an Investor is handed when his money lands: that the Farm has it, how much, on
   * what day and by which bank reference, and what he has agreed to in seven plain lines.
   *
   * Asked for by **Agreement**, which is the paper the money was signed for: it froze his Units, his
   * split, his Target Window and his Arbitrator, and another man on the same Venture may hold different
   * ones.
   *
   * The Owner's alone, as every Venture act is: who trusted her with money is not the Manager's business.
   */
  joining: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "an investor's joining letter");
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const standing = await hisStanding(
        context.db,
        context.farm.id,
        input.agreementId,
        farmDayOf(now)
      );
      assertCapitalHeld(standing);
      const day = (farmDay: string) =>
        formatDate(new Date(`${farmDay}T00:00:00Z`), language, "date");
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
        terms: joiningTerms(standing, context.farm.windUpDays),
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
            ventureId: standing.venture.id,
            investorId: standing.him.id,
            movements: standing.capital.length,
            capitalBdt: standing.capitalBdt,
          }),
        },
        () => Promise.resolve()
      );
      return { text, agreementId: standing.agreement.id };
    }),

  /**
   * অগ্রগতি — the sheet an Investor is sent while the run goes on: how his animals are doing, and where
   * his money has gone.
   *
   * The photographs come back beside the text rather than inside it. Every paper the farm writes is a
   * plain string, which is what lets it be produced again years later and read the same — a table with a
   * face in every row is not one. So the sheet says what it says, and the animals' photographs travel
   * with it for whatever draws it to lay out. Nothing is dropped: an Investor who cannot visit the shed
   * is buying on trust, and the faces are the answer to that.
   */
  progress: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "an investor's progress statement");
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const standing = await hisStanding(
        context.db,
        context.farm.id,
        input.agreementId,
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
        herdGain:
          theirs.gainKgPerDay === null ? null : said(theirs.gainKgPerDay),
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
            ventureId: standing.venture.id,
            investorId: standing.him.id,
            standing: theirs.standingCount,
            chargedBdt: spend.chargedBdt,
          }),
        },
        () => Promise.resolve()
      );
      return { text, photos, agreementId: standing.agreement.id };
    }),

  /**
   * হিসাব নিকাশ — the sheet an Investor checks the whole run against, and the document the arrangement
   * finally rests on. If he cannot follow it line by line to his own payout, the Farm has not accounted
   * to him.
   *
   * Every figure is the one approval **froze**, never what the costing says today. That is the whole
   * point of approving: the figures were written down as they stood and every Investor was paid on them,
   * which is why a Correction that would move them is refused in favour of a Settlement Adjustment. A
   * sheet that recomputed would undo all of it quietly.
   *
   * Reissued as often as she likes. An Adjustment does not rewrite this paper — it appears at the foot of
   * it, beside the frozen figures, so a man holding two sheets can see the Farm did not restate the first.
   */
  settlement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "an investor's settlement statement");
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const standing = await hisStanding(
        context.db,
        context.farm.id,
        input.agreementId,
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
      const day = (farmDay: string) =>
        formatDate(new Date(`${farmDay}T00:00:00Z`), language, "date");
      // Capital returned, by the Units it returns to.
      const perUnitIn =
        settled.units > 0 ? settled.capitalBdt / settled.units : 0;
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
            ventureId: standing.venture.id,
            investorId: standing.him.id,
            payoutBdt: settled.his.payoutBdt,
            adjustments: settled.adjustments.length,
          }),
        },
        () => Promise.resolve()
      );
      return { text, agreementId: standing.agreement.id };
    }),
};
