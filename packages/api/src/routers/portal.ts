import { farmDayOf, maskedDigits } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import {
  joiningLetterFor,
  progressStatementFor,
  settlementStatementFor,
} from "../investor-papers";
import {
  hisStanding,
  theVentureOf,
  theirSpend,
} from "../investor-statement-store";
import { shareOfUnits } from "../investor-statement-words";
import { signedInOn } from "../membership";
import {
  endSignIn,
  investorOf,
  markSeen,
  ownerNameOf,
  requireTheirs,
  signInHasRunItsDay,
  takeUpInvitation,
} from "../portal-store";
import { theirAgreements } from "../their-agreements";
import { theirProgress } from "../venture-herd-store";

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

  /**
   * Who is signed in to the portal, which farm's and how to reach it, and their own record as the farm holds it — the
   * NID and the bank account with all but their last digits hidden, enough to know them by on a screen somebody may
   * be looking over. They are put right by the Owner, not here.
   */
  me: investorProcedure.handler(async ({ context }) => {
    const theirs = await context.db.query.investor.findFirst({
      where: { id: context.investor.id, farmId: context.farm.id },
    });
    return {
      investorId: context.investor.id,
      name: context.investor.name,
      farm: {
        name: context.farm.name,
        phone: context.farm.phone,
        address: context.farm.address,
      },
      record: {
        phone: theirs?.phone ?? context.investor.phone,
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
  }),

  /**
   * Their whole part in the farm's Ventures: each Agreement with the capital held on it and what a Settlement paid,
   * and every taka of theirs that moved — capital in, capital back, payouts — the latest first. Read from their side
   * and narrowed to them before anything is assembled, as the Owner's page of them is.
   */
  portfolio: investorProcedure.handler(({ context }) =>
    theirAgreements(
      context.db,
      context.farm.id,
      context.investor.id,
      farmDayOf(context.clock.now())
    )
  ),

  /** Where they are signed in to the portal now, the one they are reading on marked, so they can sign the rest
   *  out. */
  signedInOn: investorProcedure.handler(async ({ context }) => {
    const here = context.session?.session.id ?? null;
    const places = await signedInOn(
      context.db,
      context.actor.id,
      context.clock.now()
    );
    return places.map((one) => ({ ...one, here: one.id === here }));
  }),

  /**
   * One of their Ventures as it stands today, for the portal to draw rather than print: their part of it, how the
   * animals are doing, where the Venture's money has gone and what is left of its budgets. The same figures the
   * progress statement says, and no projection — days are counted, weights are read, nothing is forecast.
   */
  venture: investorProcedure
    .input(z.object({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await requireTheirs(
        context.db,
        farmId,
        context.investor.id,
        input.agreementId
      );
      const now = context.clock.now();
      const standing = await hisStanding(
        context.db,
        farmId,
        input.agreementId,
        farmDayOf(now)
      );
      const run = await theVentureOf(context.db, farmId, standing.venture.id);
      const [theirs, spend] = await Promise.all([
        theirProgress(context.db, farmId, run, now),
        theirSpend(context.db, farmId, run),
      ]);
      return {
        agreementId: input.agreementId,
        venture: { name: standing.venture.name, state: run.state },
        his: {
          units: standing.agreement.units,
          sharePercent: shareOfUnits(
            standing.agreement.units,
            spend.signedUnits
          ),
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
          charges: spend.charges.map((one) => ({
            word: one.word,
            bdt: one.bdt,
          })),
          chargedBdt: spend.chargedBdt,
          cattleBudgetBdt: spend.cattleBudgetBdt,
          cattleBudgetLeftBdt: spend.cattleBudgetLeftBdt,
          runningBudgetBdt: spend.runningBudgetBdt,
          runningSpentBdt: spend.runningSpentBdt,
        },
      };
    }),

  /**
   * One of their own papers, as the Owner would print it: the joining letter, the progress statement, or — once the
   * Settlement is approved — the settlement statement. Each is an Export in the trail, attributed to the Investor.
   */
  paper: investorProcedure
    .input(
      z.object({
        agreementId: z.string(),
        kind: z.enum(["joining", "progress", "settlement"]),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await requireTheirs(
        context.db,
        farmId,
        context.investor.id,
        input.agreementId
      );
      if (input.kind === "joining") {
        const { text } = await joiningLetterFor(
          context,
          input.agreementId,
          await ownerNameOf(context.db, farmId)
        );
        return { text, photos: [] };
      }
      if (input.kind === "progress") {
        const { text, photos } = await progressStatementFor(
          context,
          input.agreementId
        );
        return { text, photos };
      }
      const { text } = await settlementStatementFor(context, input.agreementId);
      return { text, photos: [] };
    }),
};
