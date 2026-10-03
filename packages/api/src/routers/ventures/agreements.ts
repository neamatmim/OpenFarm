// The Venture router's part for its Investment Agreements — signed, offered in the app, amended — and their papers.
import { uuidv7 } from "@OpenFarm/db/ids";
import {
  agreementPaper,
  amendmentPaper,
  STAMPED_KINDS,
} from "@OpenFarm/db/schema/venture";
import { capitalItMayHold, farmDayOf, sumsStandingOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  approveOffer,
  offerInApp,
  offersOn,
  withdrawOffer,
} from "../../agreement-offer-store";
import { writeAgreement, writeAmendment } from "../../agreement-write";
import {
  amendmentOffersOn,
  approveAmendment,
  proposeAmendmentInApp,
  withdrawAmendment,
} from "../../amendment-offer-store";
import { audited } from "../../audit";
import { farmDay } from "../../farm-clock";
import { protectedProcedure } from "../../index";
import {
  paperOnFile,
  readAgreement,
  theFarmsShare,
} from "../../investor-store";
import {
  assertNamable,
  nomineesInput,
  nomineesToSign,
} from "../../nominations";
import { photoInput } from "../../photo-input";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../../roles";
import { currentWording, giveStandardTemplates } from "../../template-store";
import { ours } from "../../venture-act";
import { paidForBy, termsAcrossOn, termsInForceOn } from "../../venture-store";
import { money, theirs } from "./shared";

const signInput = z.object({
  ventureId: z.string(),
  investorId: z.string(),
  /** Whole Units, and no more than the Venture has left. */
  units: z.number().int().min(1).max(10_000),
  /** What the Investors take of the profit; the Farm takes the rest. */
  investorsPercent: z.number().int().min(0).max(100),
  arbitrator: z.string().trim().min(1).max(200),
  /** What the stamp cost. A stamped instrument with no stamp on it is not one. */
  stampValueMoney: money.refine((amount) => amount > 0, {
    message: "A stamped paper has a stamp value",
  }),
  stampedOn: farmDay,
  /** Stamp paper, or an e-challan paid into the treasury; the serial is the paper's or the challan's number. Agreed in
   *  the app is not signed here: it is offered, agreed and approved. */
  stampKind: z.enum(STAMPED_KINDS).default("paper"),
  stampSerial: z.string().trim().min(1).max(60),
  /** The Request to Join this paper answers: that Investor's live Request on this Venture. None for somebody who
   *  joined by phone. */
  requestId: z.string().optional(),
  /** The Nominees the paper names, as the sign sheet printed them; left out, the list in force. */
  nominees: nomineesInput.optional(),
});

export const agreementsProcedures = {
  /**
   * Who has signed for this Venture, and for how much. The stamped paper itself is not sent back — only
   * whether the farm holds it, which is what may be acted on.
   */
  agreements: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.investmentAgreement.findMany({
        where: { farmId: context.farm.id, ventureId: input.ventureId },
        orderBy: { createdAt: "asc", id: "asc" },
      });
      if (rows.length === 0) {
        return [];
      }
      const papers = await context.db.query.agreementPaper.findMany({
        where: {
          farmId: context.farm.id,
          agreementId: { in: rows.map((one) => one.id) },
        },
        columns: { agreementId: true },
      });
      const kept = new Set(papers.map((one) => one.agreementId));
      // What each paper may still take, counted as the payment counts it before refusing one too many — so a
      // man paid up is not offered to be paid again.
      const run = await context.db.query.venture.findFirst({
        where: { id: input.ventureId, farmId: context.farm.id },
        columns: {
          state: true,
          capitalPaid: true,
          unitPriceMoney: true,
          cattlePartMoney: true,
          monthlySums: true,
          firstSumDueOn: true,
        },
      });
      // Paid by the month: where each paper stands against its Monthly Sums today, once the buying has started — the
      // Owner's to read, never another Investor's.
      const monthly =
        run && run.state !== "open" ? paidForBy(run).monthly : null;
      const today = farmDayOf(context.clock.now());
      const taken = new Map<string, number>();
      for (const one of await context.db.query.ventureMovement.findMany({
        where: {
          farmId: context.farm.id,
          agreementId: { in: rows.map((row) => row.id) },
          kind: "capital_in",
        },
        columns: { agreementId: true, amountMoney: true },
      })) {
        if (one.agreementId) {
          taken.set(
            one.agreementId,
            (taken.get(one.agreementId) ?? 0) + one.amountMoney
          );
        }
      }
      return rows.map((one) => ({
        id: one.id,
        investorId: one.investorId,
        units: one.units,
        /** What the Investor writes on the transfer: the capital form picks this paper when the bank's reference
         *  carries it. */
        payInCode: one.payInCode,
        /** The Request to Join it answers, if the Investor asked through the portal. */
        requestId: one.requestId,
        /** Capital this paper may still take: its Units' worth — their Cattle Part, while a Venture paid by the month
         *  gathers its capital — less what it has taken. */
        capitalLeftMoney: Math.max(
          0,
          (run ? capitalItMayHold(one.units, run) : 0) -
            (taken.get(one.id) ?? 0)
        ),
        /** Paid by the month and running: how many Monthly Sums are paid of how many, what is due, what is missed and
         *  the next — or nothing for a Venture paid before buying, or still gathering. */
        sums: monthly
          ? sumsStandingOf({
              units: one.units,
              unitPriceMoney: run?.unitPriceMoney ?? 0,
              monthly,
              paidMoney: taken.get(one.id) ?? 0,
              today,
            })
          : null,
        investorsPercent: one.investorsPercent,
        farmPercent: theFarmsShare(one.investorsPercent),
        targetWindow: {
          start: one.targetWindowStart,
          end: one.targetWindowEnd,
        },
        arbitrator: one.arbitrator,
        stamp: {
          kind: one.stampKind,
          valueMoney: one.stampValueMoney,
          on: one.stampedOn,
          serial: one.stampSerial,
        },
        /** Whether the photograph of its stamped paper is kept. */
        hasPaper: kept.has(one.id),
        /** Whether its paper is on file as capital needs it (`paperOnFile`): what says it may take capital. */
        paperOnFile: paperOnFile(one, kept.has(one.id)),
      }));
    }),

  /**
   * One Investor signs for one Venture: the Units they take, the split those Units earn, the Arbitrator
   * both sides name, and the stamped instrument's value, day and serial.
   *
   * Refused once the Venture has left Open, so every share is fixed for the run; refused for more Units
   * than are left; and refused when it would take the farm past the Investors it may have. It names the Nominees the
   * sign sheet printed, and records them as the Investor's Nomination made by this Agreement.
   */
  sign: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(signInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      await theirs(context, input.investorId);
      if (row.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes signatures only while it is open",
          data: { refusal: "venture_wrong_state" },
        });
      }
      // The Nominees it names, judged on the day it is stamped: a Nominee who turns eighteen that day is of age on it.
      const nominees = await nomineesToSign(
        context.db,
        context.farm.id,
        input.investorId,
        input.nominees
      );
      assertNamable(nominees, input.stampedOn);
      // Signed in the wording the farm prints Agreements in now, and recorded against it for good.
      await giveStandardTemplates(context);
      const wording = await currentWording(
        context.db,
        context.farm.id,
        "investment_agreement"
      );
      const id = uuidv7(now);
      const auditing = audited(context);
      const code = await auditing.write(
        {
          entity: "investment_agreement",
          entityId: id,
          action: "create",
          after: (tx) => readAgreement(tx, context.farm.id, id),
        },
        (tx) =>
          writeAgreement(
            tx,
            auditing.recordEvent,
            context.farm,
            { id: context.actor.id, now },
            {
              id,
              venture: row,
              investorId: input.investorId,
              units: input.units,
              investorsPercent: input.investorsPercent,
              arbitrator: input.arbitrator,
              stamp: {
                kind: input.stampKind,
                valueMoney: input.stampValueMoney,
                on: input.stampedOn,
                serial: input.stampSerial,
              },
              templateVersionId: wording.versionId,
              requestId: input.requestId,
              nominees,
            }
          )
      );
      // Said back to the Owner where they have just signed, for the Investor to write on the transfer.
      return { id, payInCode: code };
    }),

  /**
   * An Investment Agreement offered to one Investor to agree to in the app, instead of on stamped paper
   * (`offerInApp`): the same terms the sign sheet takes, with no stamp. Refused while the farm's switch is off.
   */
  offerInApp: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        investorId: z.string(),
        units: z.number().int().min(1).max(10_000),
        investorsPercent: z.number().int().min(0).max(100),
        arbitrator: z.string().trim().min(1).max(200),
        requestId: z.string().optional(),
        nominees: nomineesInput.optional(),
      })
    )
    .handler(({ context, input }) => offerInApp(context, input)),

  /** Takes an offer back, agreed or not, until it is approved (`withdrawOffer`). */
  withdrawOffer: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ offerId: z.string() }))
    .handler(async ({ context, input }) => {
      await withdrawOffer(context, input.offerId);
      return { id: input.offerId };
    }),

  /** Approves an offer the Investor has agreed to: the Agreement is written from it (`approveOffer`). */
  approveOffer: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ offerId: z.string() }))
    .handler(({ context, input }) => approveOffer(context, input.offerId)),

  /**
   * An Amendment offered to every Investor on a Venture to agree to in the app, instead of on a paper they all sign
   * (`proposeAmendmentInApp`). Refused while the farm's switch is off.
   */
  proposeAmendmentInApp: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        investorsPercent: z.number().int().min(0).max(100),
        targetWindowStart: farmDay,
        targetWindowEnd: farmDay,
        reason: z.string().trim().min(1).max(400),
      })
    )
    .handler(({ context, input }) => proposeAmendmentInApp(context, input)),

  /** Takes an Amendment offer back until it is approved (`withdrawAmendment`). */
  withdrawAmendment: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ offerId: z.string() }))
    .handler(async ({ context, input }) => {
      await withdrawAmendment(context, input.offerId);
      return { id: input.offerId };
    }),

  /** Approves an Amendment every Investor on the Venture has agreed to: the Venture is amended (`approveAmendment`). */
  approveAmendment: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ offerId: z.string() }))
    .handler(({ context, input }) => approveAmendment(context, input.offerId)),

  /** Every Amendment offered on a Venture to agree to in the app, and how far it has got (`amendmentOffersOn`). */
  amendmentOffers: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(({ context, input }) =>
      amendmentOffersOn(context, input.ventureId)
    ),

  /** Every offer made on a Venture to agree to in the app, and where each stands (`offersOn`). */
  agreementOffers: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(({ context, input }) => offersOn(context, input.ventureId)),

  /**
   * One paper amending every Agreement on a Venture: the split, the Target Window, the day everybody
   * signed it, why, and a photograph of it.
   *
   * One act because it is one piece of paper — story 7 says an amendment is "signed by every Investor
   * in that Venture", so a Venture cannot be half amended and this writes every row or none. What each
   * Agreement said before is never edited: the original stays legible beside what it became, which is
   * what lets the farm answer what a man had agreed to on the day a thing happened.
   *
   * Refused once the Settlement is approved: those figures are what everybody was paid on.
   */
  amend: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      photoInput.extend({
        ventureId: z.string(),
        investorsPercent: z.number().int().min(0).max(100),
        targetWindowStart: farmDay,
        targetWindowEnd: farmDay,
        /** The day every Investor signed it, which is what decides what was in force when. */
        signedOn: farmDay,
        reason: z.string().trim().min(1).max(400),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      if (input.targetWindowStart > input.targetWindowEnd) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Target Window needs its days in order",
          data: { refusal: "window_out_of_order" },
        });
      }
      await giveStandardTemplates(context);
      const wording = await currentWording(
        context.db,
        context.farm.id,
        "agreement_amendment"
      );
      const amendedId = uuidv7();
      const amended = await audited(context).write(
        {
          entity: "venture",
          entityId: row.id,
          action: "update",
          reason: input.reason,
          // The same question on both sides of the act: what every Agreement said on the day they
          // signed. A Venture row read twice would say nothing, because an amendment never touches it.
          before: (tx) =>
            termsAcrossOn(tx, context.farm.id, row.id, input.signedOn),
          after: (tx) =>
            termsAcrossOn(tx, context.farm.id, row.id, input.signedOn),
        },
        async (tx) => {
          const signed = await writeAmendment(
            tx,
            context.farm.id,
            { id: context.actor.id, now },
            {
              ventureId: row.id,
              amendedId,
              signedOn: input.signedOn,
              investorsPercent: input.investorsPercent,
              targetWindowStart: input.targetWindowStart,
              targetWindowEnd: input.targetWindowEnd,
              reason: input.reason,
              templateVersionId: wording.versionId,
            }
          );
          // One photograph of one piece of paper, kept once and pointed at by every row.
          await tx.insert(amendmentPaper).values({
            amendedId,
            farmId: context.farm.id,
            contentType: input.contentType,
            data: input.data,
            updatedAt: now,
          });
          return signed.length;
        }
      );
      return { id: amendedId, agreements: amended };
    }),

  /**
   * What one Agreement said on a given day: the latest amendment signed on or before it, or the paper
   * as it was signed.
   *
   * Asked by day rather than by "now" because that is the question that gets asked — what had this man
   * agreed to when the thing happened. A paper printed for him reads this, not the row.
   */
  termsOn: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ agreementId: z.string(), on: farmDay }))
    .handler(async ({ context, input }) => {
      const mine = await context.db.query.investmentAgreement.findFirst({
        where: { id: input.agreementId, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!mine) {
        throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
      }
      const terms = await termsInForceOn(
        context.db,
        context.farm.id,
        mine.id,
        input.on
      );
      if (!terms) {
        throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
      }
      // Whether the signed amendment is on file, the way `agreements` reports the stamped paper: the
      // photograph itself never leaves the database, but a dispute needs to know the farm has one.
      const paper = terms.amendedId
        ? await context.db.query.amendmentPaper.findFirst({
            where: { amendedId: terms.amendedId, farmId: context.farm.id },
            columns: { amendedId: true },
          })
        : null;
      return {
        ...terms,
        paperKept: paper !== null,
        farmPercent: theFarmsShare(terms.investorsPercent),
      };
    }),

  /**
   * The photo of an Agreement's stamped paper as the farm kept it — the signed original, to look at or print again
   * whenever it is needed. Nothing for one the farm has not photographed yet. The Owner's alone, as keeping it is.
   */
  agreementPaper: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.investmentAgreement.findFirst({
        where: { id: input.agreementId, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
      }
      const paper = await context.db.query.agreementPaper.findFirst({
        where: { agreementId: row.id, farmId: context.farm.id },
        columns: { contentType: true, data: true, updatedAt: true },
      });
      return paper ?? null;
    }),

  /** The photo of the stamped paper, kept against its Agreement. Replacing it replaces the one photo. */
  keepAgreementPaper: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(photoInput.extend({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await context.db.query.investmentAgreement.findFirst({
        where: { id: input.agreementId, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
      }
      await audited(context).write(
        {
          entity: "investment_agreement",
          entityId: row.id,
          action: "update",
          before: (tx) => readAgreement(tx, context.farm.id, row.id),
          after: (tx) => readAgreement(tx, context.farm.id, row.id),
        },
        (tx) =>
          tx
            .insert(agreementPaper)
            .values({
              agreementId: row.id,
              farmId: context.farm.id,
              contentType: input.contentType,
              data: input.data,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: agreementPaper.agreementId,
              set: {
                contentType: input.contentType,
                data: input.data,
                updatedAt: now,
              },
            })
      );
      return { keptAt: now };
    }),
};
