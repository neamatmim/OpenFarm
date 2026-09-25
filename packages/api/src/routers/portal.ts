import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import {
  PORTAL_PAPER_KINDS,
  theirOpenVentures,
  theirOwnRequests,
  theirPaper,
  theirPortfolio,
  theirRecord,
  theirSignIns,
  theirVentureToday,
} from "../portal-reads";
import {
  endSignIn,
  investorOf,
  markSeen,
  signInHasRunItsDay,
  takeUpInvitation,
} from "../portal-store";
import {
  askToJoin,
  requestNote,
  unitsAsked,
  withdrawRequest,
} from "../requests-to-join";

/** Anybody who is not an Investor the farm has let in, however they came. */
const refuse = () =>
  new ORPCError("FORBIDDEN", {
    message: "This is for an Investor the farm has let in",
    data: { refusal: "not_an_investor" },
  });

/**
 * The only way into what an Investor may read: an account the farm opened from their invitation, holding no Role on
 * the farm, while the portal is open and their access stands (ADR 0007). Anybody else — the Owner, a milker, a
 * stranger's session — is refused here, whatever they may do elsewhere.
 */
export const investorProcedure = protectedProcedure.use(
  async ({ context, next }) => {
    const theFarm = context.farm;
    if (!theFarm?.investorPortal || context.roles.length > 0) {
      throw refuse();
    }
    const investor = await investorOf(context.db, theFarm.id, context.actor.id);
    if (!investor) {
      throw refuse();
    }
    const now = context.clock.now();
    // A sign-in lasts a working day, however recently it was used: then they sign in again.
    const signedIn = context.session?.session;
    if (signedIn && signInHasRunItsDay(new Date(signedIn.createdAt), now)) {
      await endSignIn(context.db, signedIn.id, now);
      throw new ORPCError("UNAUTHORIZED", {
        message: "Signed in for a day already — sign in again",
        data: { refusal: "signed_in_too_long" },
      });
    }
    await markSeen(context.db, theFarm.id, context.actor.id, now);
    return next({ context: { farm: theFarm, investor } });
  }
);

/** The Investor portal: taking up an invitation, and what an Investor reads. */
export const portalRouter = {
  /**
   * An Investor taking up the Owner's invitation with the phone they were written down with, the code handed to
   * them, and a password of their own. Answers with what the account signs in as, which the screen signs them in
   * with next.
   */
  join: publicProcedure
    .input(
      z.object({
        phone: z.string().trim().min(1).max(30),
        code: z.string().trim().min(4).max(32),
        password: z.string().min(1).max(128),
      })
    )
    .handler(({ context, input }) => takeUpInvitation(context, input)),

  /** Who is signed in, which farm's portal it is, and their own record, masked (`theirRecord`). */
  me: investorProcedure.handler(({ context }) => theirRecord(context)),

  /** Their Agreements and every taka of theirs that moved (`theirPortfolio`). */
  portfolio: investorProcedure.handler(({ context }) =>
    theirPortfolio(context)
  ),

  /** The Ventures raising capital the Owner is showing them (`theirOpenVentures`, ADR 0008). */
  openVentures: investorProcedure.handler(({ context }) =>
    theirOpenVentures(context)
  ),

  /**
   * Asking to join a Venture the farm is showing, for whole Units and a note if they like — or, with a Request still
   * waiting, changing it. It binds nobody, holds no Units and moves no money: joining is only by signing in person.
   */
  requestToJoin: investorProcedure
    .input(
      z.object({ ventureId: z.string(), units: unitsAsked, note: requestNote })
    )
    .handler(({ context, input }) =>
      askToJoin(context, context.investor.id, input)
    ),

  /** Withdrawing their own Request, which nobody is held to. */
  withdrawRequest: investorProcedure
    .input(z.object({ requestId: z.string() }))
    .handler(async ({ context, input }) => {
      await withdrawRequest(context, context.investor.id, input.requestId);
      return { id: input.requestId };
    }),

  /** Their own Requests to Join and where each stands (`theirOwnRequests`). */
  myRequests: investorProcedure.handler(({ context }) =>
    theirOwnRequests(context)
  ),

  /** Where they are signed in to the portal now, the one they are reading on marked, so they can sign the rest
   *  out. */
  signedInOn: investorProcedure.handler(({ context }) =>
    theirSignIns(context, context.session?.session.id ?? null)
  ),

  /** One of their own Ventures as it stands today (`theirVentureToday`); refused for one not theirs. */
  venture: investorProcedure
    .input(z.object({ agreementId: z.string() }))
    .handler(({ context, input }) =>
      theirVentureToday(context, input.agreementId)
    ),

  /** One of their own papers (`theirPaper`), an Export in the trail attributed to the Investor. */
  paper: investorProcedure
    .input(
      z.object({
        agreementId: z.string(),
        kind: z.enum(PORTAL_PAPER_KINDS),
      })
    )
    .handler(({ context, input }) =>
      theirPaper(context, context.investor.id, input.agreementId, input.kind)
    ),
};
