import { farmDayOf } from "@OpenFarm/domain";
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
import {
  investorOf,
  ownerNameOf,
  requireTheirs,
  takeUpInvitation,
} from "../portal-store";
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

  /** Who is signed in to the portal, and which farm's. */
  me: investorProcedure.handler(({ context }) => ({
    investorId: context.investor.id,
    name: context.investor.name,
    farm: { name: context.farm.name },
  })),

  /**
   * Every Venture this Investor is in, by the Agreement they signed for it, the latest first: the Venture and where
   * it stands, their Units and the capital the Farm holds of theirs, and the terms in force today. Nobody else's.
   */
  ventures: investorProcedure.handler(async ({ context }) => {
    const today = farmDayOf(context.clock.now());
    const signed = await context.db.query.investmentAgreement.findMany({
      where: { farmId: context.farm.id, investorId: context.investor.id },
      columns: { id: true },
      orderBy: { createdAt: "desc", id: "desc" },
    });
    return Promise.all(
      signed.map(async (one) => {
        const standing = await hisStanding(
          context.db,
          context.farm.id,
          one.id,
          today
        );
        const run = await theVentureOf(
          context.db,
          context.farm.id,
          standing.venture.id
        );
        return {
          agreementId: one.id,
          venture: { name: standing.venture.name, state: run.state },
          units: standing.agreement.units,
          capitalBdt: standing.capitalBdt,
          investorsPercent: standing.agreement.investorsPercent,
          targetWindowStart: standing.agreement.targetWindowStart,
          targetWindowEnd: standing.agreement.targetWindowEnd,
          amendedOn: standing.agreement.amendedOn,
        };
      })
    );
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
