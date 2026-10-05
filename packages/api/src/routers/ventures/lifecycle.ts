import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { venture } from "@OpenFarm/db/schema/venture";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import type { MonthlyTerms } from "@OpenFarm/domain";
import {
  farmDayOf,
  mayMoveTo,
  monthlyTermsOf,
  roundMoney,
  takesCapital,
  towardsTheFloor,
} from "@OpenFarm/domain";
// The Venture router's part for opening a Venture, showing it, its plan and projection, and moving it through its life.
import { currencyWords } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../../audit";
import { audited } from "../../audit";
import { NEVER_CHECKED } from "../../bank-standing";
import { farmDay } from "../../farm-clock";
import { protectedProcedure } from "../../index";
import { tellTheOwnerAPaperIsDue } from "../../investor-statement-notice";
import { missedByEach } from "../../monthly-sums-store";
import { closePayInNotes } from "../../pay-in-notes";
import { projectionBasisOf, projectionOf } from "../../projection-store";
import { owedTheFarmByEach } from "../../reimbursement-store";
import {
  answerRequest,
  closeRequests,
  requestsOf,
  theAnswer,
} from "../../requests-to-join";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../../roles";
import { ours } from "../../venture-act";
import { planAgainstActual, planOf, savePlan } from "../../venture-plan-store";
import {
  changePortalWords,
  portalWords,
  showInPortal,
  takeOutOfPortal,
} from "../../venture-showing";
import type { VentureRow } from "../../venture-store";
import {
  balanceOf,
  bankStandingOf,
  budgetsOf,
  cattleMoneyShortOf,
  heldByEach,
  lockTheFarm,
  nextVentureOrdinal,
  NOTHING_HELD,
  readMovement,
  readVenture,
  signedForEach,
  stillHersByEach,
  ventureView,
  windUpEndsOn,
  withWindowsInForce,
} from "../../venture-store";
import type { Context } from "./shared";
import { openInput, planned } from "./shared";

/** The states in which a Venture has animals somebody is looking after. One still Open has bought
 *  nothing; a settled or cancelled one has nothing left to feed. */
const AT_WORK = ["buying", "fattening", "selling"] as const;

/**
 * The terms a Venture paid by the month opens on, or nothing for one paid before buying. Refused where its own figures
 * leave nothing to pay by the month, or no 10th to pay it on before its Target Window — said before it opens rather
 * than discovered by the first Investor asked to sign.
 */
const termsToOpenOn = (
  input: z.infer<typeof openInput>,
  plan: ReturnType<typeof planned>
): MonthlyTerms | null => {
  if (input.capitalPaid !== "by_the_month") {
    return null;
  }
  const terms = monthlyTermsOf({
    unitPriceMoney: input.unitPriceMoney,
    targetCapitalMoney: input.targetCapitalMoney,
    cattleBudgetMoney: plan.cattleBudgetMoney,
    decideBy: input.decideBy,
    targetWindowStart: input.targetWindowStart,
  });
  if (terms === "no_month_to_pay_in") {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "No 10th falls after the month it is decided in and before its Target Window",
      data: { refusal: "venture_no_month_to_pay_in" },
    });
  }
  if (terms === "nothing_to_pay_monthly") {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Its Cattle Budget is all its capital: nothing is left to pay by the month",
      data: { refusal: "venture_nothing_to_pay_monthly" },
    });
  }
  return terms;
};

/**
 * That a Venture may start buying: it holds its Floor — what it holds, not what once arrived — and, paid by the month,
 * every signed Unit's Cattle Part has come. Asked behind the Farm lock, on the Venture as it stands there.
 */
const assertReadyToBuy = async (
  tx: Tx,
  farmId: string,
  row: VentureRow
): Promise<void> => {
  const held = await heldByEach(tx, farmId, [row.id]);
  const signed = await signedForEach(tx, farmId, [row.id]);
  const signedUnits = signed.get(row.id)?.units ?? 0;
  // What it holds, not what once arrived: money sent back is not money to start on. Paid by the month, the capital
  // its signed Units are for, since before buying it holds only their Cattle Parts.
  const standing = held.get(row.id);
  const counted = towardsTheFloor({
    capitalPaid: row.capitalPaid,
    heldMoney: standing ? balanceOf(standing) : 0,
    signedUnits,
    unitPriceMoney: row.unitPriceMoney,
  });
  if (counted < row.floorMoney) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The Venture holds less than its Floor",
      data: { refusal: "venture_under_floor" },
    });
  }
  // Paid by the month, the buying waits on every signed Unit's Cattle Part as well: the Monthly Sums keep the animals
  // and buy none, so a lorry sent on part of the cattle money buys a herd short of the one everybody signed for.
  const shortMoney = cattleMoneyShortOf(
    row,
    standing ?? NOTHING_HELD,
    signedUnits
  );
  if (shortMoney > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${shortMoney} ${currencyWords("en").sum} of the signed Investors' cattle money has still to come`,
      data: { refusal: "cattle_money_short" },
    });
  }
};

/** Moves a Venture on by hand, and says why not when the lifecycle does not allow it. */
const moveTo = async (
  context: Context,
  id: string,
  to: "buying" | "fattening"
): Promise<{ state: "buying" | "fattening" }> => {
  const row = await ours(context, id);
  if (!mayMoveTo(row.state, to)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A Venture that is ${row.state} does not go to ${to}`,
      data: { refusal: "venture_wrong_state" },
    });
  }
  const auditing = audited(context);
  await auditing.write(
    {
      entity: "venture",
      entityId: row.id,
      action: "update",
      before: (tx) => readVenture(tx, context.farm.id, row.id),
      after: (tx) => readVenture(tx, context.farm.id, row.id),
    },
    async (tx) => {
      // Behind the lock every act on a Venture takes, and asked again behind it: an Investor asking to join at the
      // same moment must either be refused or have their Request closed here, never left waiting on a Venture that
      // has stopped gathering capital.
      await lockTheFarm(tx, context.farm.id);
      const standing = await tx.query.venture.findFirst({
        where: { id: row.id, farmId: context.farm.id },
      });
      if (!(standing && mayMoveTo(standing.state, to))) {
        throw new ORPCError("BAD_REQUEST", {
          message: `A Venture that is ${standing?.state ?? row.state} does not go to ${to}`,
          data: { refusal: "venture_wrong_state" },
        });
      }
      // Its money counted behind the lock too: capital sent back at the same moment is not money to start on.
      if (to === "buying") {
        await assertReadyToBuy(tx, context.farm.id, standing);
      }
      await tx.update(venture).set({ state: to }).where(eq(venture.id, row.id));
      // Taking no more capital — one paid before buying once it buys, one paid by the month once it sells: a note of
      // money sent is waiting for nothing the farm can still record (ADR 0018).
      if (!takesCapital({ ...standing, state: to })) {
        await closePayInNotes(
          tx,
          auditing.recordEvent,
          context.farm.id,
          { ventureId: row.id },
          "venture_takes_no_capital",
          context.clock.now()
        );
      }
      // No longer gathering capital: nothing asked for it, or promised on it, is waiting any more.
      if (to === "buying") {
        await closeRequests(
          tx,
          auditing.recordEvent,
          context.farm.id,
          { ventureId: row.id },
          "venture_buying",
          context.clock.now()
        );
      }
      // Buying closing is one of the four moments an Investor hears at: his money has become animals,
      // and what the Cattle Budget did not spend has rolled into what keeps them.
      if (to === "fattening") {
        await tellTheOwnerAPaperIsDue(
          tx,
          context.farm.id,
          { ...row, state: to },
          { kind: "buying_closed" },
          context.clock.now()
        );
      }
    }
  );
  return { state: to };
};

export const lifecycleProcedures = {
  /**
   * The Ventures the farm has, newest first, each with what it holds against what it was looking for.
   *
   * The Owner's alone. A Venture is money between her and the people who trusted her with it; the Manager
   * runs the shed and sees which Venture owns an Animal, which arrives with the buying increment.
   */
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      // Each with the window its Investors signed last, which is the one its Wind-up Period runs from.
      const rows = await withWindowsInForce(
        context.db,
        context.farm.id,
        await context.db.query.venture.findMany({
          where: { farmId: context.farm.id },
          orderBy: { createdAt: "desc", id: "desc" },
        }),
        farmDayOf(context.clock.now())
      );
      const ids = rows.map((one) => one.id);
      const held = await heldByEach(context.db, context.farm.id, ids);
      const signed = await signedForEach(context.db, context.farm.id, ids);
      const checked = await bankStandingOf(context.db, context.farm.id, ids);
      const stillHers = await stillHersByEach(context.db, context.farm.id, ids);
      const missed = await missedByEach(
        context.db,
        context.farm.id,
        rows,
        farmDayOf(context.clock.now())
      );
      const settled = await context.db.query.ventureSettlement.findMany({
        where: { farmId: context.farm.id, ventureId: { in: ids } },
        columns: { ventureId: true },
      });
      const approved = new Set(settled.map((one) => one.ventureId));
      const owed = await owedTheFarmByEach(
        context.db,
        context.farm.id,
        rows,
        farmDayOf(context.clock.now())
      );
      return rows.map((one) => ({
        ...ventureView(one, held.get(one.id), signed.get(one.id), {
          warnBelowMoney: context.farm.runningBudgetWarnMoney,
          bank: checked.get(one.id) ?? NEVER_CHECKED,
          windUpDays: context.farm.windUpDays,
          stillHers: stillHers.get(one.id) ?? 0,
          owedTheFarmMoney: owed.get(one.id) ?? 0,
        }),
        /** Whether its Settlement has been approved. From then every Investor is being paid on figures
         *  written down, so the acts that would move them — a month reimbursed, the Owner's own money in,
         *  the terms amended — are refused, and the screen should stop offering them. */
        settlementApproved: approved.has(one.id),
        /** Paid by the month: what its Investors have missed of their Monthly Sums, past their seven days — which the
         *  Owner's own money may feed the animals through until it comes. Nothing for any other Venture. */
        sumsMissedMoney: missed.get(one.id) ?? 0,
      }));
    }),

  /**
   * The Ventures the Manager is looking after cattle for, and what the roles matrix gives him of each:
   * the budgets, what has gone against them, what is left, and what is going wrong.
   *
   * Its own procedure rather than `ventures.list` narrowed on the way out, because a field the client
   * merely does not draw is still a field the client was sent — and what is kept back here is who
   * trusted the Owner with money, how much each of them put in, and what any of them is owed. He is
   * told nothing about an Investor, a Unit, a split, a payout or what the run made.
   *
   * Only the runs with animals to look after. A Venture still Open has bought nothing and a settled or
   * cancelled one has nothing left to feed, and neither is work he can do anything about today.
   */
  running: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const rows = await withWindowsInForce(
        context.db,
        context.farm.id,
        await context.db.query.venture.findMany({
          where: { farmId: context.farm.id, state: { in: [...AT_WORK] } },
          orderBy: { createdAt: "desc", id: "desc" },
        }),
        farmDayOf(context.clock.now())
      );
      const ids = rows.map((one) => one.id);
      const [held, stillHers, signed, owed] = await Promise.all([
        heldByEach(context.db, context.farm.id, ids),
        stillHersByEach(context.db, context.farm.id, ids),
        signedForEach(context.db, context.farm.id, ids),
        // The same figure the Owner's list reads, worked out by the same function: two readings of one Venture's
        // warning must never disagree.
        owedTheFarmByEach(
          context.db,
          context.farm.id,
          rows,
          farmDayOf(context.clock.now())
        ),
      ]);
      return rows.map((row) => {
        const budgets = budgetsOf(
          row,
          held.get(row.id),
          signed.get(row.id)?.units ?? 0
        );
        return {
          id: row.id,
          name: row.name,
          state: row.state,
          /** What its capital was planned as, and what is left of each side of it. */
          cattleBudgetMoney: budgets.cattleBudgetMoney,
          runningBudgetMoney: budgets.runningBudgetMoney,
          cattleBudgetHeldMoney: budgets.cattleBudgetHeldMoney,
          runningBudgetHeldMoney: budgets.runningBudgetHeldMoney,
          /** What its animals have cost it so far. */
          spentMoney: roundMoney(held.get(row.id)?.spentMoney ?? 0),
          /** What its animals have cost the Farm since the last Reimbursement, and the Farm is still owed. */
          owedTheFarmMoney: owed.get(row.id) ?? 0,
          runningBudgetLow:
            budgets.runningBudgetHeldMoney - (owed.get(row.id) ?? 0) <
            context.farm.runningBudgetWarnMoney,
          targetWindow: {
            start: row.targetWindowStart,
            end: row.targetWindowEnd,
          },
          windUpEndsOn: windUpEndsOn(
            row.targetWindowEnd,
            context.farm.windUpDays
          ),
          animalsStanding: stillHers.get(row.id) ?? 0,
        };
      });
    }),

  /**
   * One Venture written up before anybody pays into it: what it is looking for, the Floor below which
   * buying is not worth starting, the day to decide by, the window it sells in, its Units and how its
   * capital is planned between buying the animals and keeping them.
   */
  open: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(openInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const plan = planned(input, context.farm);
      if (plan.floorMoney > input.targetCapitalMoney) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Floor cannot be more than the capital the Venture is after",
          data: { refusal: "venture_floor_over_target" },
        });
      }
      // What the Units can raise is all the capital the farm will take for it, so a Floor above that is one
      // no signature could ever reach: the run would stay Open for ever, waiting on money it may not accept.
      if (plan.floorMoney > plan.units * input.unitPriceMoney) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The Floor cannot be more than the Units can raise",
          data: { refusal: "venture_floor_over_units" },
        });
      }
      if (plan.cattleBudgetMoney > input.targetCapitalMoney) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Cattle Budget cannot be more than the capital it comes from",
          data: { refusal: "venture_budget_over_capital" },
        });
      }
      const monthly = termsToOpenOn(input, plan);
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture",
          entityId: id,
          action: "create",
          after: (tx) => readVenture(tx, context.farm.id, id),
        },
        async (tx) => {
          // Its place is one past the farm's highest so far, so it is read behind the Farm lock signing takes too.
          await lockTheFarm(tx, context.farm.id);
          await tx.insert(venture).values({
            id,
            farmId: context.farm.id,
            ordinal: await nextVentureOrdinal(tx, context.farm.id),
            name: input.name,
            targetCapitalMoney: input.targetCapitalMoney,
            floorMoney: plan.floorMoney,
            decideBy: input.decideBy,
            targetWindowStart: input.targetWindowStart,
            targetWindowEnd: input.targetWindowEnd,
            unitPriceMoney: input.unitPriceMoney,
            units: plan.units,
            cattleBudgetMoney: plan.cattleBudgetMoney,
            capitalPaid: monthly ? "by_the_month" : "before_buying",
            cattlePartMoney: monthly?.cattlePartMoney ?? null,
            monthlySums: monthly?.sums ?? null,
            firstSumDueOn: monthly?.firstDueOn ?? null,
            openedBy: context.actor.id,
            openedByRole: context.roleUsed,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /**
   * Shows an Open Venture to the farm's invited Investors in the portal, with the Owner's few words on it (ADR 0008).
   * Every invited Investor who is not retired sees it, or nobody does: there is no choosing people one by one.
   */
  showInPortal: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), words: portalWords }))
    .handler(async ({ context, input }) => {
      await showInPortal(context, input.id, input.words);
      return { id: input.id };
    }),

  /** New words on a Venture already shown in the portal. */
  changePortalWords: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), words: portalWords }))
    .handler(async ({ context, input }) => {
      await changePortalWords(context, input.id, input.words);
      return { id: input.id };
    }),

  /** Takes a Venture out of the portal: invited Investors are no longer offered it. */
  takeOutOfPortal: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await takeOutOfPortal(context, input.id);
      return { id: input.id };
    }),

  /**
   * The Venture Account's bank details, written on the Venture: where a signed Investor is told to pay (ADR 0008).
   * The Owner's alone, because whoever writes these decides where the Investors' money goes, and every change is an
   * Audit Event keeping what they said before — nobody quietly redirects an Investor's money. The bank, the account's
   * name and its number are asked for; the branch and routing number may be written later. Not only while it is Open:
   * the same account carries its buying, its refunds and its payouts, and is put right whenever the bank changes it.
   */
  setBankAccount: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        id: z.string(),
        bank: z.string().trim().min(1).max(120),
        branch: z.string().trim().max(120).default(""),
        accountName: z.string().trim().min(1).max(120),
        accountNumber: z.string().trim().min(1).max(40),
        routingNumber: z.string().trim().max(20).default(""),
      })
    )
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.id);
      await audited(context).write(
        {
          entity: "venture",
          entityId: row.id,
          action: "update",
          before: (tx) => readVenture(tx, context.farm.id, row.id),
          after: (tx) => readVenture(tx, context.farm.id, row.id),
        },
        (tx) =>
          tx
            .update(venture)
            .set({
              accountBank: input.bank,
              accountBranch: input.branch === "" ? null : input.branch,
              accountName: input.accountName,
              accountNumber: input.accountNumber,
              accountRoutingNumber:
                input.routingNumber === "" ? null : input.routingNumber,
            })
            .where(
              and(eq(venture.id, row.id), eq(venture.farmId, context.farm.id))
            )
      );
      return { id: row.id };
    }),

  /** The Venture Plan: what its capital is meant to buy and feed, and how it is going against that. */
  plan: {
    /**
     * A Venture's **Venture Plan**: every version the Owner saved, the one in force, and the baseline it is measured
     * against, each with what it comes to (`planOf`). The Owner's alone, as a Venture's money is.
     */
    get: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(z.object({ ventureId: z.string() }))
      .handler(async ({ context, input }) => {
        const row = await ours(context, input.ventureId);
        return await planOf(
          context.db,
          context.farm.id,
          row,
          farmDayOf(context.clock.now())
        );
      }),

    /**
     * A new version of a Venture's plan: its buying lines by weight band and what a kilo will sell at. While it is Open
     * the Owner may change it as often as she likes; after buying begins each change is a revision with its reason, and
     * the plan made before stays what the Venture is measured against. An Audit Event each time.
     */
    set: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(
        z
          .object({
            ventureId: z.string(),
            lines: z
              .array(
                z
                  .object({
                    animals: z.number().int().positive().max(500),
                    fromKg: z.number().positive().max(2000),
                    toKg: z.number().positive().max(2000),
                    buyMoneyPerKg: z.number().positive().max(100_000),
                    dailyGainKg: z.number().min(0).max(5),
                    /** The Breed the line buys; nothing for any Breed. */
                    breedId: z.string().min(1).nullable().default(null),
                  })
                  .refine((line) => line.fromKg < line.toKg, {
                    message: "A band's lower weight is below its upper",
                    path: ["fromKg"],
                  })
              )
              .min(1)
              .max(20),
            saleLowMoneyPerKg: z.number().positive().max(100_000),
            saleHighMoneyPerKg: z.number().positive().max(100_000),
            /** The share of its animals the Owner expects not to live to be sold. Half the herd is past planning. */
            deathsPercent: z.number().min(0).max(50).default(0),
            reason: z.string().trim().max(300).nullable().default(null),
          })
          .refine((one) => one.saleLowMoneyPerKg <= one.saleHighMoneyPerKg, {
            message: "The low price is above the high one",
            path: ["saleLowMoneyPerKg"],
          })
      )
      .handler(async ({ context, input }) => {
        const row = await ours(context, input.ventureId);
        const { ventureId: _venture, ...said } = input;
        const saved = await audited(context).write(
          {
            entity: "venture_plan",
            entityId: row.id,
            action: "create",
            after: { ...said, lines: said.lines.map((line) => ({ ...line })) },
          },
          (tx) =>
            savePlan(
              tx,
              context.farm.id,
              row,
              { ...said, reason: said.reason === "" ? null : said.reason },
              {
                userId: context.session?.user.id ?? null,
                at: context.clock.now(),
              }
            )
        );
        return { ventureId: row.id, ...saved };
      }),

    /**
     * A Venture measured against the plan it opened on (`planAgainstActual`): buying by band, growth and money beside
     * the baseline. The Owner's alone; nothing while it has no plan.
     */
    againstActual: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(z.object({ ventureId: z.string() }))
      .handler(async ({ context, input }) => {
        const row = await ours(context, input.ventureId);
        return await planAgainstActual(
          context.db,
          context.farm.id,
          row,
          context.farm.ventureInvestorsPercent,
          context.clock.now()
        );
      }),
  },

  /**
   * A Venture's **Projection** and the figures it is worked from (ADR 0010): what its Settlement might come to at the
   * Owner's low and high sale prices. The Owner's alone, like the rest of a Venture's money; nothing while no sale
   * prices are set.
   */
  projection: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return {
        basis: await projectionBasisOf(context.db, context.farm.id, row.id),
        projection: await projectionOf(
          context.db,
          context.farm.id,
          row,
          context.farm.ventureInvestorsPercent,
          context.clock.now()
        ),
      };
    }),

  /** Investors' Requests to Join, waiting for the Owner's answer. */
  requests: {
    /**
     * A Venture's Requests to Join, each with its history beneath it, and beside them the Units signed and the Units
     * asked for and waiting — the Owner's to read, and nobody else's.
     */
    list: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(z.object({ ventureId: z.string() }))
      .handler(({ context, input }) =>
        requestsOf(context.db, context.farm, input.ventureId)
      ),

    /**
     * The Owner answers a Request to Join: come and sign for the Units asked or fewer — never more than the Venture has
     * left to promise — or not this time, with a line to the Investor if she likes. A yes to somebody new answers with
     * what signing them would make the Investor count: a warning, never a refusal.
     */
    answer: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(z.object({ requestId: z.string(), answer: theAnswer }))
      .handler(({ context, input }) =>
        answerRequest(context, input.requestId, input.answer)
      ),
  },

  /**
   * The Owner says the money is in and the buying may start. Refused while what the Venture holds is under
   * its Floor: buying a handful of bulls on half the capital is not the run anybody signed for.
   */
  startBuying: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) => moveTo(context, input.id, "buying")),

  /** All bought: the Venture is feeding them now. */
  startFattening: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) => moveTo(context, input.id, "fattening")),

  /**
   * A Venture called off: the Floor was not met by the day it had to be, so nothing is bought and every
   * taka goes back. Only from Open — once an animal has been bought with the money, it is not a plan any
   * more.
   *
   * Every capital movement it took needs its own refund, with the day and the reference of the transfer
   * that sent it: the Venture ends when the money is on its way back, not before.
   */
  cancel: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        id: z.string(),
        reason: z.string().trim().min(1).max(400),
        refunds: z
          .array(
            z.object({
              movementId: z.string(),
              movedOn: farmDay,
              reference: z.string().trim().min(1).max(120),
            })
          )
          .max(200)
          .default([]),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.id);
      if (row.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only a Venture still open may be called off",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const sendingBack = new Map(
        input.refunds.map((one) => [one.movementId, one] as const)
      );
      const auditing = audited(context);
      let sentBack = 0;
      await auditing.write(
        {
          entity: "venture",
          entityId: row.id,
          action: "update",
          reason: input.reason,
          before: (tx) => readVenture(tx, context.farm.id, row.id),
          after: (tx) => readVenture(tx, context.farm.id, row.id),
        },
        async (tx) => {
          // Behind the lock every act on a Venture takes, and asked again behind it, as starting to buy is.
          await lockTheFarm(tx, context.farm.id);
          const standing = await tx.query.venture.findFirst({
            where: { id: row.id, farmId: context.farm.id },
            columns: { state: true },
          });
          if (standing?.state !== "open") {
            throw new ORPCError("BAD_REQUEST", {
              message: "Only a Venture still open may be called off",
              data: { refusal: "venture_wrong_state" },
            });
          }
          // Read inside the transaction: capital committing while the Owner filled the refunds in would
          // otherwise be left behind in a Venture that is already called off.
          const taken = await tx.query.ventureMovement.findMany({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              kind: "capital_in",
            },
          });
          const unaccounted = taken.filter((one) => !sendingBack.has(one.id));
          if (unaccounted.length > 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: `${unaccounted.length} capital movements have no refund`,
              data: { refusal: "capital_not_sent_back" },
            });
          }
          const itsOwn = new Set(taken.map((one) => one.id));
          if (input.refunds.some((one) => !itsOwn.has(one.movementId))) {
            throw new ORPCError("BAD_REQUEST", {
              message: "A refund names money this Venture never took",
              data: { refusal: "refund_not_its_money" },
            });
          }
          const refunds = taken.map((one) => ({
            id: uuidv7(now),
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "refund" as const,
            agreementId: one.agreementId,
            amountMoney: one.amountMoney,
            movedOn: sendingBack.get(one.id)?.movedOn ?? "",
            reference: sendingBack.get(one.id)?.reference ?? "",
            refundsId: one.id,
            recordedBy: context.actor.id,
            createdAt: now,
          }));
          if (refunds.length > 0) {
            await tx.insert(ventureMovement).values(refunds);
          }
          // One Audit Event per refund: "where is my money" is answered by the trail, a line per
          // transfer. They go one at a time because they share the transaction the cancel holds.
          for (const one of refunds) {
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one statement at a time
            const after = await readMovement(tx, context.farm.id, one.id);
            // oxlint-disable-next-line no-await-in-loop -- as above
            await auditing.recordEvent(
              tx,
              {
                entity: "venture_movement",
                entityId: one.id,
                action: "create",
                reason: input.reason,
              },
              { after }
            );
          }
          sentBack = refunds.length;
          await tx
            .update(venture)
            .set({ state: "cancelled", cancelledReason: input.reason })
            .where(eq(venture.id, row.id));
          // Called off: every Request on it, answered or not, closes with it.
          await closeRequests(
            tx,
            auditing.recordEvent,
            context.farm.id,
            { ventureId: row.id },
            "venture_cancelled",
            now
          );
          // And every note of money sent towards it: what came in has gone back above.
          await closePayInNotes(
            tx,
            auditing.recordEvent,
            context.farm.id,
            { ventureId: row.id },
            "venture_takes_no_capital",
            now
          );
        }
      );
      return { state: "cancelled" as const, refunded: sentBack };
    }),
};
