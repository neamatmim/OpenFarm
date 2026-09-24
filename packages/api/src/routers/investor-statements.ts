import { paperFrom } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { assertRegistered, exportedPaper } from "../export-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  joiningLetterFor,
  progressStatementFor,
  settlementStatementFor,
} from "../investor-papers";
import { paperInvestor, paperValues, producedAt } from "../paper-values";
import { languageOf } from "../reader-language";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import type { Wording } from "../template-store";
import { currentWording, giveStandardTemplates } from "../template-store";

/** What the screen says of the wording a paper was laid out in: its Version, and whether a lawyer approved it. */
const wordingSaid = (wording: Wording) => ({
  number: wording.number,
  reviewedBy: wording.reviewedBy,
  reviewedOn: wording.reviewedOn,
});

export const investorStatementsRouter = {
  /**
   * মুদারাবা বিনিয়োগ চুক্তি — the Investment Agreement for one Investor and one Venture, laid out from the terms the
   * Owner is about to sign on, to be printed onto stamp paper or to go with an e-challan. Nothing is written but the
   * trail's line: the Agreement exists once it is signed, stamped and entered.
   *
   * The Owner's alone, from her own phone, as signing is. The target window is the Venture's, as signing copies it.
   */
  agreementToSign: protectedProcedure
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
      await giveStandardTemplates(context);
      const wording = await currentWording(
        context.db,
        context.farm.id,
        "investment_agreement"
      );
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const investor = paperInvestor(him);
      const document = paperFrom(wording.content, {
        parties: {
          farm: context.farm,
          ownerName: context.actor.name,
          investors: [investor],
        },
        values: paperValues({
          farm: context.farm,
          ownerName: context.actor.name,
          him: investor,
          ventureName: run.name,
          units: input.units,
          unitPriceBdt: run.unitPriceBdt,
          investorsPercent: input.investorsPercent,
          windowStart: run.targetWindowStart,
          windowEnd: run.targetWindowEnd,
          windUpDays: context.farm.windUpDays,
          arbitrator: input.arbitrator,
        }),
        producedBy: context.actor.name,
        producedAt: producedAt(now, language),
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
            wording: wording.number,
          }),
        },
        () => Promise.resolve()
      );
      return { document, wording: wordingSaid(wording) };
    }),

  /**
   * সংশোধনী — the Amendment for a Venture, laid out from the terms the Owner is about to amend it to, to be printed
   * and signed by every Investor on it: one paper, as an Amendment is. Nothing is written but the trail's line; the
   * Amendment exists once it is signed, photographed and entered.
   */
  amendmentToSign: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        investorsPercent: z.number().int().min(0).max(100),
        targetWindowStart: farmDay,
        targetWindowEnd: farmDay,
        signedOn: farmDay,
        reason: z.string().trim().min(1).max(400),
      })
    )
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "an Amendment");
      const run = await context.db.query.venture.findFirst({
        where: { id: input.ventureId, farmId: context.farm.id },
        columns: { id: true, name: true },
      });
      if (!run) {
        throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
      }
      const signed = await context.db.query.investmentAgreement.findMany({
        where: { farmId: context.farm.id, ventureId: run.id },
        columns: { investorId: true },
        orderBy: { createdAt: "asc", id: "asc" },
      });
      const investors = await context.db.query.investor.findMany({
        where: {
          farmId: context.farm.id,
          id: { in: signed.map((one) => one.investorId) },
        },
      });
      const [first, ...rest] = signed.flatMap((one) => {
        const row = investors.find((him) => him.id === one.investorId);
        return row ? [paperInvestor(row)] : [];
      });
      if (!first) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Nobody has signed for this Venture yet",
          data: { refusal: "nobody_has_signed" },
        });
      }
      await giveStandardTemplates(context);
      const wording = await currentWording(
        context.db,
        context.farm.id,
        "agreement_amendment"
      );
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const document = paperFrom(wording.content, {
        parties: {
          farm: context.farm,
          ownerName: context.actor.name,
          investors: [first, ...rest],
        },
        values: paperValues({
          farm: context.farm,
          ownerName: context.actor.name,
          ventureName: run.name,
          investorsPercent: input.investorsPercent,
          windowStart: input.targetWindowStart,
          windowEnd: input.targetWindowEnd,
          amendedOn: input.signedOn,
          reason: input.reason,
        }),
        producedBy: context.actor.name,
        producedAt: producedAt(now, language),
      });
      await audited(context).write(
        {
          entity: "venture",
          entityId: run.id,
          action: "export",
          after: exportedPaper(context.farm, "amendment_draft", {
            investorsPercent: input.investorsPercent,
            wording: wording.number,
          }),
        },
        () => Promise.resolve()
      );
      return { document, wording: wordingSaid(wording) };
    }),

  /**
   * যোগদানপত্র — the paper an Investor is handed when his money lands: that the Farm has it, how much, on
   * what day and by which bank reference, and what he has agreed to — the terms of the wording his Agreement was
   * signed in, filled from what is in force today.
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
      await giveStandardTemplates(context);
      return joiningLetterFor(context, input.agreementId, context.actor.name);
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
    .handler(({ context, input }) =>
      progressStatementFor(context, input.agreementId)
    ),

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
    .handler(({ context, input }) =>
      settlementStatementFor(context, input.agreementId)
    ),
};
