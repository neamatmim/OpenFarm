import type { StampKind } from "@OpenFarm/db/schema/venture";
import {
  dayInBangla,
  farmDayOf,
  paperFrom,
  wordingFor,
} from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { agreedPaperOf } from "../agreement-offer-store";
import { agreementLaidOut, amendmentLaidOut } from "../agreement-paper";
import { audited } from "../audit";
import { assertRegistered, exportedPaper } from "../export-store";
import { farmOnTheStampedDay } from "../farm-as-signed";
import { assertTheVenturesSplit, farmUnitsOf } from "../farm-capital-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  joiningLetterFor,
  progressStatementFor,
  settlementStatementFor,
} from "../investor-papers";
import { nominationSignedWith, paperNominees } from "../nomination-store";
import { assertNamable, nomineesInput, nomineesToSign } from "../nominations";
import { paperInvestor, paperValues, producedAt } from "../paper-values";
import { noticeFilling } from "../portal-reads";
import { languageOf } from "../reader-language";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import type { Wording } from "../template-store";
import {
  currentWording,
  giveStandardTemplates,
  wordingSignedIn,
} from "../template-store";
import { windUpDaysOf, paidForBy, withWindowsInForce } from "../venture-store";

/**
 * What a copy of an Agreement writes into the stamp's blanks — serial, value, day — and the line marking it a copy and
 * not the original: the stamp it was signed on, or, agreed in the app, that it carries none, the day it was approved
 * and the agreed paper's number.
 */
const copyMarksOf = (agreement: {
  stampKind: StampKind;
  stampSerial: string;
  stampValueMoney: number;
  stampedOn: string;
}): { filled: string[]; copyOf: string } => {
  const day = dayInBangla(agreement.stampedOn);
  if (agreement.stampKind === "in_app") {
    return {
      filled: [agreement.stampSerial, "নেই — অ্যাপে সম্মত", day],
      copyOf: `অনুলিপি — মূল নয় / COPY — not the original · অ্যাপে সম্মত / Agreed in the app · অনুমোদন / Approved ${day} · সম্মত কাগজ নম্বর / Agreed paper no. ${agreement.stampSerial}`,
    };
  }
  return {
    filled: [
      agreement.stampSerial,
      `${formatNumber(agreement.stampValueMoney, "bn")} টাকা`,
      day,
    ],
    copyOf: `অনুলিপি — মূল নয় / COPY — not the original · স্ট্যাম্প ক্রমিক / Stamp serial ${agreement.stampSerial} · স্ট্যাম্পের তারিখ / Stamped ${day}`,
  };
};

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
        /** The Nominees it is to name, as written on the sign sheet; left out, the list in force. */
        nominees: nomineesInput.optional(),
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
            unitPriceMoney: true,
            units: true,
            targetWindowStart: true,
            targetWindowEnd: true,
            capitalPaid: true,
            cattlePartMoney: true,
            monthlySums: true,
            firstSumDueOn: true,
            windUpDays: true,
          },
        }),
        context.db.query.investor.findFirst({
          // The Farm's own partner record is no person: it is handed no paper.
          where: {
            id: input.investorId,
            farmId: context.farm.id,
            isFarm: false,
          },
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
      // The Nominees it will name — written on the sign sheet, or the list in force — each judged a minor or not on the
      // day it is printed to be signed.
      const today = farmDayOf(now);
      const nominees = await nomineesToSign(
        context.db,
        context.farm.id,
        him.id,
        input.nominees
      );
      assertNamable(nominees, today);
      // On the Farm's own Units' split, where it holds any: a stamp bought for terms the farm would refuse is wasted.
      await assertTheVenturesSplit(
        context.db,
        context.farm.id,
        run.id,
        input.investorsPercent
      );
      // As the Amendments signed so far have left its Target Window: what the Agreement it becomes records.
      const [inForce = run] = await withWindowsInForce(
        context.db,
        context.farm.id,
        [run],
        today
      );
      const document = agreementLaidOut({
        farm: context.farm,
        ownerName: context.actor.name,
        run: inForce,
        him,
        nominees,
        terms: input,
        wording: wording.content,
        today,
        producedAt: producedAt(now, language),
        farmUnits: await farmUnitsOf(context.db, context.farm.id, run.id),
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
   * A copy of an Investment Agreement already signed, to print again whenever it is needed: laid out from what the
   * Agreement holds — its own Units, split, window and Arbitrator as signed (an Amendment is a paper of its own), in the
   * wording Version it was signed in, naming the Nominees it named, with the name of whoever signed for the Farm — and
   * marked on every page as a copy of the stamped paper it copies, so it can never be signed as a second original. The
   * Owner's alone, as the Agreement is; an Export filed against the Agreement each time.
   */
  agreementCopy: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "a copy of an Investment Agreement");
      const agreement = await context.db.query.investmentAgreement.findFirst({
        where: { id: input.agreementId, farmId: context.farm.id },
      });
      if (!agreement) {
        throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
      }
      const [run, him, signer, nomination, wording] = await Promise.all([
        context.db.query.venture.findFirst({
          where: { id: agreement.ventureId, farmId: context.farm.id },
          columns: {
            id: true,
            name: true,
            unitPriceMoney: true,
            units: true,
            capitalPaid: true,
            cattlePartMoney: true,
            monthlySums: true,
            firstSumDueOn: true,
            windUpDays: true,
          },
        }),
        context.db.query.investor.findFirst({
          // The Farm's own Units were signed on no paper, so there is none to copy.
          where: {
            id: agreement.investorId,
            farmId: context.farm.id,
            isFarm: false,
          },
        }),
        agreement.signedBy
          ? context.db.query.user.findFirst({
              where: { id: agreement.signedBy },
              columns: { name: true },
            })
          : undefined,
        nominationSignedWith(context.db, context.farm.id, agreement.id),
        wordingSignedIn(context.db, context.farm.id, agreement),
      ]);
      if (!(run && him)) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such Venture or Investor",
        });
      }
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      // Whoever signed for the Farm on the day, not whoever asks for the copy.
      const ownerName = signer?.name ?? context.actor.name;
      // Its Nominees as it named them, each a minor or not on the day it was stamped, as the original printed them.
      const investor = paperInvestor(
        him,
        paperNominees(nomination, agreement.stampedOn)
      );
      // As it was signed: a Venture paid by the month printed its clauses and schedule; no other did.
      const { monthly } = paidForBy(run);
      // The Farm's own Units, which it takes only before anybody signs: as this paper told him.
      const farmUnits = await farmUnitsOf(context.db, context.farm.id, run.id);
      // Headed as the stamped paper was: the farm's name and Registration on the day it was signed.
      const asSigned = farmOnTheStampedDay(
        agreement.farmAsSigned,
        context.farm
      );
      const farmCapital =
        farmUnits > 0 ? { farmUnits, ventureUnits: run.units } : null;
      const document = paperFrom(
        wordingFor(wording.content, {
          paidByTheMonth: monthly !== null,
          farmCapital: farmCapital !== null,
          organization: Boolean(investor.organization),
        }),
        {
          kind: "investment_agreement",
          parties: {
            farm: asSigned,
            ownerName,
            investors: [investor],
          },
          values: paperValues({
            farm: asSigned,
            ownerName,
            him: investor,
            ventureName: run.name,
            units: agreement.units,
            unitPriceMoney: run.unitPriceMoney,
            investorsPercent: agreement.investorsPercent,
            windowStart: agreement.targetWindowStart,
            windowEnd: agreement.targetWindowEnd,
            windUpDays: windUpDaysOf(run, context.farm),
            arbitrator: agreement.arbitrator,
            monthly,
            farmCapital,
          }),
          producedBy: context.actor.name,
          producedAt: producedAt(now, language),
          version: wording.number,
        }
      );
      await audited(context).write(
        {
          entity: "investment_agreement",
          entityId: agreement.id,
          action: "export",
          after: exportedPaper(context.farm, "agreement_copy", {
            ventureId: run.id,
            investorId: him.id,
            wording: wording.number,
          }),
        },
        () => Promise.resolve()
      );
      // Agreed in the app, the copy is of the very paper agreed to, as it was kept; signed on stamp, laid out again.
      const original =
        (agreement.stampKind === "in_app"
          ? await agreedPaperOf(context.db, context.farm.id, agreement.id)
          : null) ?? document;
      const { filled, copyOf } = copyMarksOf(agreement);
      return {
        document: {
          ...original,
          sections: original.sections.map((section) =>
            section.kind === "stamp" ? { ...section, filled } : section
          ),
          copyOf,
        },
        wording: wordingSaid(wording),
      };
    }),

  /**
   * «আপনার তথ্য», the privacy notice, laid out to hand an Investor with the Agreement he is signing — every Investor,
   * invited to the portal or not, since the Agreement's data section points him to it. The Version in force with the
   * farm's own facts in it, in Bangla; refused while any of them is unwritten, as the Welcome Letter's back is. An
   * Export filed against him, naming the Venture he was signing for and the Version handed over.
   */
  noticeToHand: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string(), investorId: z.string() }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "the privacy notice");
      const [run, him] = await Promise.all([
        context.db.query.venture.findFirst({
          where: { id: input.ventureId, farmId: context.farm.id },
          columns: { id: true },
        }),
        context.db.query.investor.findFirst({
          // The Farm's own partner record is no person: it is handed no paper.
          where: {
            id: input.investorId,
            farmId: context.farm.id,
            isFarm: false,
          },
        }),
      ]);
      if (!(run && him)) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such Venture or Investor",
        });
      }
      await giveStandardTemplates(context);
      const wording = await currentWording(
        context.db,
        context.farm.id,
        "privacy_notice"
      );
      const { values, whole } = await noticeFilling(
        context.db,
        context.farm,
        wording.content
      );
      if (!whole) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The privacy notice still names a fact the farm has not written down",
          data: { refusal: "notice_unwritten" },
        });
      }
      const now = context.clock.now();
      const document = paperFrom(wording.content, {
        kind: "privacy_notice",
        parties: {
          farm: context.farm,
          ownerName: context.actor.name,
          // The notice has no parties part: it names nobody's Nominees.
          investors: [paperInvestor(him, [])],
        },
        values,
        producedBy: context.actor.name,
        producedAt: producedAt(
          now,
          await languageOf(context.db, context.actor.id)
        ),
        version: wording.number,
      });
      await audited(context).write(
        {
          entity: "investor",
          entityId: him.id,
          action: "export",
          after: exportedPaper(context.farm, "privacy_notice", {
            investorId: him.id,
            ventureId: run.id,
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
      await giveStandardTemplates(context);
      const wording = await currentWording(
        context.db,
        context.farm.id,
        "agreement_amendment"
      );
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const { document, run } = await amendmentLaidOut(context.db, {
        farm: context.farm,
        ownerName: context.actor.name,
        ventureId: input.ventureId,
        terms: input,
        amendedOn: input.signedOn,
        wording: wording.content,
        today: farmDayOf(now),
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
