import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import type { PortalReader } from "../portal-reads";
import {
  PORTAL_PAPER_KINDS,
  theNoticeToRead,
  theirOpenVentures,
  theirOwnRequests,
  theirPaper,
  theirPortfolio,
  theirRecord,
  theirSignIns,
  theirVentureToday,
} from "../portal-reads";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";

// The Portal Preview: the Owner reading one Investor's portal as they would read it today, from the Owner's own
// sign-in. The Owner's check before inviting anybody, and what the lawyer is shown — so it answers for anybody on
// file, invited or not, retired or not, with the portal open or shut. It never goes through the Investor's own door
// (`investorProcedure`): it signs nobody in as them, marks nothing seen, and leaves nothing on their side.

/** The Owner alone, on their own phone. An Investor's account holds no Role and never gets here, for any id. */
const ownersPreview = protectedProcedure
  .use(requireOnly("owner", OWNER_ONLY))
  .use(requirePersonalSession());

const whose = z.object({ investorId: z.string() });

/** The Investor on this farm whose portal is read, whatever their standing; nobody is refused for not being in. */
const readerFor = async (
  context: Context,
  investorId: string
): Promise<PortalReader> => {
  const theFarm = context.farm;
  const them = theFarm
    ? await context.db.query.investor.findFirst({
        where: { id: investorId, farmId: theFarm.id },
        columns: { id: true, name: true, phone: true },
      })
    : null;
  if (!theFarm || !them) {
    throw new ORPCError("NOT_FOUND", {
      message: "No such Investor",
      data: { refusal: "no_such_investor" },
    });
  }
  return {
    db: context.db,
    clock: context.clock,
    farm: theFarm,
    investor: them,
  };
};

export const portalPreviewRouter = {
  /**
   * «আপনার তথ্য» as their portal shows it — read with the portal shut too, as every page of the Preview is: the Owner
   * checks the notice before anybody is invited, and the lawyer is shown it.
   */
  yourData: ownersPreview.handler(({ context }) => {
    if (!context.farm) {
      throw new ORPCError("NOT_FOUND", { message: "No farm" });
    }
    return theNoticeToRead(context.db, context.farm);
  }),

  /** Their record as their portal shows it: masked as they see it. */
  me: ownersPreview
    .input(whose)
    .handler(async ({ context, input }) =>
      theirRecord(await readerFor(context, input.investorId))
    ),

  /** Their Agreements and money, as their portfolio shows them. */
  portfolio: ownersPreview
    .input(whose)
    .handler(async ({ context, input }) =>
      theirPortfolio(await readerFor(context, input.investorId))
    ),

  /** The Ventures raising capital their portal would offer them today: none if they are retired. */
  openVentures: ownersPreview
    .input(whose)
    .handler(async ({ context, input }) =>
      theirOpenVentures(await readerFor(context, input.investorId))
    ),

  /** Their Requests to Join as they read them. The Owner answers them from the Owner's own side, not here. */
  myRequests: ownersPreview
    .input(whose)
    .handler(async ({ context, input }) =>
      theirOwnRequests(await readerFor(context, input.investorId))
    ),

  /** Where they are signed in to the portal now; none of them is where the Owner is reading. */
  signedInOn: ownersPreview
    .input(whose)
    .handler(async ({ context, input }) =>
      theirSignIns(await readerFor(context, input.investorId), null)
    ),

  /** One of their Ventures as their portal draws it today. Refused for an Agreement that is not theirs. */
  venture: ownersPreview
    .input(whose.extend({ agreementId: z.string() }))
    .handler(async ({ context, input }) =>
      theirVentureToday(
        await readerFor(context, input.investorId),
        input.agreementId
      )
    ),

  /**
   * One of their papers, made as the Owner's own Export — the paper the Owner may print from the Agreement anyway —
   * noted in the trail as made in this Investor's preview, so it never reads as a paper they opened.
   */
  paper: ownersPreview
    .input(
      whose.extend({
        agreementId: z.string(),
        kind: z.enum(PORTAL_PAPER_KINDS),
      })
    )
    .handler(async ({ context, input }) => {
      const reader = await readerFor(context, input.investorId);
      return theirPaper(
        { ...context, farm: reader.farm, inPreviewOf: reader.investor.id },
        reader.investor.id,
        input.agreementId,
        input.kind
      );
    }),
};
