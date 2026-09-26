import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import {
  agreementAmendment,
  agreementPaper,
  amendmentPaper,
  ventureSettlementShare,
  ventureSettlement,
  ventureBankCheck,
  STAMP_KINDS,
  investmentAgreement,
  venture,
  ventureMovement,
  ventureProjection,
} from "@OpenFarm/db/schema/venture";
import type { PaymentMethod } from "@OpenFarm/domain";
import {
  farmDayOf,
  hasEnded,
  isExitState,
  isRunning,
  mayMoveTo,
  RUNNING_STATES,
  monthOf,
  roundTaka,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  ventureMovementCorrection,
  ventureMovementCorrectionInput,
  whyItStands,
} from "../corrections/venture-movement";
import { consumedBy, economicsOfHerd, farmCosts } from "../cost-store";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { tagsOfHerRecords } from "../herd-store";
import { protectedProcedure } from "../index";
import { theOwnersOf } from "../intake-store";
import { recordInternalSale } from "../internal-sale-store";
import { tellTheOwnerAPaperIsDue } from "../investor-statement-notice";
import {
  countedInvestors,
  nextPayInCode,
  readAgreement,
  theFarmsShare,
  unitsTaken,
} from "../investor-store";
import { monthInput } from "../money-inputs";
import { bookMoney, bookingOf } from "../money-store";
import {
  assertNamable,
  nominationBySigning,
  nomineesInput,
  nomineesToSign,
} from "../nominations";
import { photoInput } from "../photo-input";
import { projectionBasisOf, projectionOf } from "../projection-store";
import {
  answerBySigning,
  answerRequest,
  closeRequests,
  requestsOf,
  theAnswer,
} from "../requests-to-join";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import {
  adjustmentAgainst,
  adjustmentsOf,
  closeAdjustment,
  raiseAdjustment,
  theAdjustment,
} from "../settlement-adjustment-store";
import {
  approvedSettlementOf,
  approveSettlement,
  payOut,
  reachesSettledOnLastPayout,
  readSettlement,
  settlementOf,
} from "../settlement-store";
import { currentWording, giveStandardTemplates } from "../template-store";
import { actOnVenture } from "../venture-act";
import { theirProgress } from "../venture-herd-store";
import { planAgainstActual, planOf, savePlan } from "../venture-plan-store";
import {
  changePortalWords,
  portalWords,
  showInPortal,
  takeOutOfPortal,
} from "../venture-showing";
import {
  balanceAtMonthEnd,
  balanceOf,
  budgetsOf,
  directionOf,
  heldByEach,
  termsAcrossOn,
  termsInForceOn,
  NEVER_CHECKED,
  bankStandingOf,
  readBankCheck,
  readInternalSale,
  whatSheLastWeighed,
  whatTheFloatBought,
  readMovement,
  readVenture,
  takenAgainst,
  signedForEach,
  ventureView,
  lockTheFarm,
  nextVentureOrdinal,
  stillHersByEach,
  priceAtWeight,
  stillHersOf,
  windUpEndsOn,
  ownedThenByOf,
} from "../venture-store";

/** Taka. A Venture is planned in lakhs; the column keeps poisha so the money can be added up. */
const money = z.number().min(0).max(1_000_000_000);

/** The states in which a Venture has animals somebody is looking after. One still Open has bought
 *  nothing; a settled or cancelled one has nothing left to feed. */
const AT_WORK = ["buying", "fattening", "selling"] as const;

const openInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    targetCapitalBdt: money,
    /** The least capital this is worth starting on. The farm's own percentage unless the Owner says. */
    floorBdt: money.optional(),
    /** The day the Floor must be met by. */
    decideBy: farmDay,
    targetWindowStart: farmDay,
    targetWindowEnd: farmDay,
    unitPriceBdt: money,
    /** How many Units there are. As many as the unit price divides the capital into, unless the Owner
     *  says otherwise: a Venture may leave Units unsold and take less than it hoped. */
    units: z.number().int().min(1).max(10_000).optional(),
    /** The part of the capital meant for buying animals; the rest keeps them. The farm's own share
     *  unless the Owner says. */
    cattleBudgetBdt: money.optional(),
  })
  .refine((one) => one.targetWindowStart <= one.targetWindowEnd, {
    message: "A Target Window needs its days in order",
  });

/** The plan as it stands once the farm's own parameters have filled in what the Owner did not say. */
const planned = (
  input: z.infer<typeof openInput>,
  settings: { ventureFloorPercent: number; ventureRunningPercent: number }
) => ({
  floorBdt:
    input.floorBdt ??
    Math.round((input.targetCapitalBdt * settings.ventureFloorPercent) / 100),
  units:
    input.units ??
    Math.max(1, Math.round(input.targetCapitalBdt / input.unitPriceBdt)),
  cattleBudgetBdt:
    input.cattleBudgetBdt ??
    Math.round(
      (input.targetCapitalBdt * (100 - settings.ventureRunningPercent)) / 100
    ),
});

const signInput = z.object({
  ventureId: z.string(),
  investorId: z.string(),
  /** Whole Units, and no more than the Venture has left. */
  units: z.number().int().min(1).max(10_000),
  /** What the Investors take of the profit; the Farm takes the rest. */
  investorsPercent: z.number().int().min(0).max(100),
  arbitrator: z.string().trim().min(1).max(200),
  /** What the stamp cost. A stamped instrument with no stamp on it is not one. */
  stampValueBdt: money.refine((taka) => taka > 0, {
    message: "A stamped paper has a stamp value",
  }),
  stampedOn: farmDay,
  /** Stamp paper, or an e-challan paid into the treasury; the serial is the paper's or the challan's number. */
  stampKind: z.enum(STAMP_KINDS).default("paper"),
  stampSerial: z.string().trim().min(1).max(60),
  /** The Request to Join this paper answers: that Investor's live Request on this Venture. None for somebody who
   *  joined by phone. */
  requestId: z.string().optional(),
  /** The Nominees the paper names, as the sign sheet printed them; left out, the list in force. */
  nominees: nomineesInput.optional(),
});

const capitalInput = z.object({
  agreementId: z.string(),
  amountBdt: money.refine((taka) => taka > 0, {
    message: "Capital in is money arriving",
  }),
  /** The day the bank moved it, on the farm's own clock. */
  movedOn: farmDay,
  /** The farm's own word for how money moved. The door takes all three so it can refuse two of them in
   *  the reader's own language: a schema that only knew "bank" would answer cash with a type error. */
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** The transfer, cheque or deposit slip, and what it is numbered. */
  reference: z.string().trim().min(1).max(120),
});

/** The context a gated handler has: the Role is settled and the Farm is certain. */
type Context = Parameters<typeof audited>[0] & { farm: { id: string } };

/** Every movement of a Venture's money is by bank: a Venture Account is not a cash gate. */
const assertByBank = (paymentMethod: string) => {
  if (paymentMethod !== "bank") {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture Account moves money by bank only",
      data: { refusal: "capital_must_be_by_bank" },
    });
  }
};

/**
 * That nobody has approved this Venture's Settlement yet.
 *
 * Approving writes down what the account holds and what everyone is owed out of it. Money moving after
 * that leaves the frozen figures describing an account that no longer exists — and those figures are what
 * every Investor is paid on.
 */
const assertNotSettledUp = async (
  tx: Tx,
  farmId: string,
  ventureId: string
) => {
  const approved = await tx.query.ventureSettlement.findFirst({
    where: { farmId, ventureId },
    columns: { id: true },
  });
  if (approved) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Venture's Settlement has been approved",
      data: { refusal: "already_approved" },
    });
  }
};

/** This Farm's Venture, or nothing the caller may act on. */
/** A Venture's Projection figures as the trail keeps them, before and after the Owner changes them. */
const basisSnapshot = async (tx: Tx, farmId: string, ventureId: string) => {
  const basis = await projectionBasisOf(tx, farmId, ventureId);
  return basis ? { ...basis } : null;
};

const ours = async (context: Context, id: string) => {
  const row = await context.db.query.venture.findFirst({
    where: { id, farmId: context.farm.id },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  return row;
};

/** This Farm's Investor, or nothing the caller may sign for. Without this, another Farm's Investor could
 *  be signed onto our Venture: they would count against our cap and never appear on our own list. */
const theirs = async (context: Context, id: string) => {
  const row = await context.db.query.investor.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  return row;
};

/**
 * Holds the Farm's row for the rest of this transaction, so counts made against a Venture's money are
 * still true when the write lands. Signings and Floats are rare and the lock is cheap; two phones
 * agreeing on a rule that may not be overridden is not.
 */
/**
 * That a Venture may still trade animals: it has started and has not finished. A Venture that is
 * selling is counting what it holds, and one settled or called off has nothing left to move.
 */
const assertVentureMayTrade = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  id: string | null,
  side: "buyer" | "seller"
) => {
  if (id === null) {
    return;
  }
  const row = await tx.query.venture.findFirst({
    where: { id, farmId },
    columns: { state: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  if (row.state !== "buying" && row.state !== "fattening") {
    // Which side is at fault, because "the Venture is not where it would have to be" is no help when
    // there are two of them.
    throw new ORPCError("BAD_REQUEST", {
      message: `The ${side}'s Venture is ${row.state}, and does not trade animals`,
      data: {
        refusal:
          side === "buyer" ? "buyer_cannot_trade" : "seller_cannot_trade",
      },
    });
  }
};

/** A line of a Reimbursement with the name of the thing it was, in both languages the farm keeps. */
const named = (
  lines: readonly { id: string; bdt: number }[],
  names: Map<string, { bn: string; en: string | null }>
) =>
  lines.map((line) => ({
    ...line,
    nameBn: names.get(line.id)?.bn ?? "",
    nameEn: names.get(line.id)?.en ?? null,
  }));

/**
 * What one Venture's Animals consumed of what the Farm bought, over one month.
 *
 * Charged by who owned her the day she ate it. An Animal sold between purses mid-month is repaid for by
 * each owner for the days that owner had her; one sold to a buyer and gone is still charged to the
 * Venture that owned her while she was here.
 */
const whatItsAnimalsConsumed = async (
  context: Context,
  ventureId: string,
  month: string
) => {
  const ownedThenBy = await ownedThenByOf(context.db, context.farm.id);
  const { from, until } = monthOf(startOfFarmDay(`${month}-01`));
  const costs = await farmCosts(context.db, context.farm.id);
  const consumed = consumedBy(costs, ownedThenBy, ventureId, { from, until });
  // Named, not numbered: "which Feed Items, which doses, which Herd Costs" is a list the Owner reads
  // aloud, and an id is not something anybody can read aloud.
  const [items, drugs, categories] = await Promise.all([
    context.db.query.feedItem.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
    context.db.query.drugProduct.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
    context.db.query.moneyCategory.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
  ]);
  return {
    ...consumed,
    madeOf: {
      feed: named(
        consumed.madeOf.feed,
        new Map(
          items.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      medicine: named(
        consumed.madeOf.medicine,
        new Map(
          drugs.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      herd: named(
        consumed.madeOf.herd,
        new Map(
          categories.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      /** Where each outing went. One name, not two: a haat is called what it is called. */
      trips: named(
        consumed.madeOf.trips,
        new Map(
          [...costs.sellingTrips].map(([id, wentTo]) => [
            id,
            { bn: wentTo, en: null },
          ])
        )
      ),
    },
  };
};

/**
 * One bank check has one id, made of the Farm, the Venture and the month rather than the clock.
 *
 * A month is read once and put right afterwards, never recorded twice — and an id minted per call would
 * let two readings race into a row one of them then updates under the other's id, leaving the trail with
 * a create that points at nothing.
 */
const idOfTheMonth = (farmId: string, ventureId: string, month: string) =>
  `${farmId}:${ventureId}:${month}`;

/** This Farm's Investment Agreement, or nothing the caller may move money against. */
const theAgreement = async (context: Context, id: string) => {
  const row = await context.db.query.investmentAgreement.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true, ventureId: true, units: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
  }
  return row;
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
  if (to === "buying") {
    const held = await heldByEach(context.db, context.farm.id, [row.id]);
    // What it holds, not what once arrived: money sent back is not money to start on.
    const standing = held.get(row.id);
    if ((standing ? balanceOf(standing) : 0) < row.floorBdt) {
      throw new ORPCError("BAD_REQUEST", {
        message: "The Venture holds less than its Floor",
        data: { refusal: "venture_under_floor" },
      });
    }
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
        columns: { state: true },
      });
      if (!(standing && mayMoveTo(standing.state, to))) {
        throw new ORPCError("BAD_REQUEST", {
          message: `A Venture that is ${standing?.state ?? row.state} does not go to ${to}`,
          data: { refusal: "venture_wrong_state" },
        });
      }
      await tx.update(venture).set({ state: to }).where(eq(venture.id, row.id));
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

/** What one payment out of an approved Settlement is: how much, and what it marks off when it lands. */
interface GoingOut {
  amountBdt: number;
  mark: (tx: Tx, movementId: string) => Promise<unknown>;
}

/**
 * One payment against an approved Settlement, whichever of the four it is: three going out, and the Farm's
 * share of a loss coming in.
 *
 * An Investor's share, the Owner's own money back and the Farm's share of the profit are the same act
 * with a different name on the cheque: the same lock, the same refusal when nothing has been approved,
 * the same movement of the Venture's money, and the same look afterwards at whether anything is left to
 * pay. What differs is who is owed and what it marks off, which is all `owed` decides.
 */
const moveSettlementMoney = async (
  // Narrower than `Context` on two counts, because the Farm's share is booked onto the Farm's own
  // books and a booking needs both: somebody did this, and it was done in a Role.
  context: Context & {
    actor: { id: string };
    roleUsed: NonNullable<Context["roleUsed"]>;
  },
  input: {
    ventureId: string;
    movedOn: string;
    paymentMethod: PaymentMethod;
    reference: string;
  },
  kind: "payout" | "advance_repaid" | "farm_share" | "farm_loss_in",
  owed: (
    approved: NonNullable<Awaited<ReturnType<typeof approvedSettlementOf>>>
  ) => GoingOut
) => {
  const now = context.clock.now();
  const row = await ours(context, input.ventureId);
  assertByBank(input.paymentMethod);
  return await audited(context).write(
    {
      entity: "venture_settlement",
      entityId: row.id,
      action: "update",
      before: (tx) => readSettlement(tx, context.farm.id, row.id),
      after: (tx) => readSettlement(tx, context.farm.id, row.id),
    },
    async (tx) => {
      await lockTheFarm(tx, context.farm.id);
      const approved = await approvedSettlementOf(tx, context.farm.id, row.id);
      if (!approved) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Nothing is owed until the Settlement is approved",
          data: { refusal: "not_yet_approved" },
        });
      }
      const going = owed(approved);
      const movementId = await payOut(
        tx,
        context.farm.id,
        {
          ventureId: row.id,
          kind,
          amountBdt: going.amountBdt,
          movedOn: input.movedOn,
          reference: input.reference,
        },
        { actorId: context.actor.id, now }
      );
      await going.mark(tx, movementId);
      // The Farm's share is the one part of a Settlement that is the Farm's own earnings, so it lands
      // on the Farm's books as income. An Investor's payout and the Owner's Advance coming back are
      // not: that money was never the Farm's, and counting it would read a run's whole proceeds as the
      // Farm's own.
      //
      // The Farm's share of a loss is the same money the other way: the Farm's own taka, going in to carry
      // its part of a run that lost, and so on the Farm's books as money out.
      if (kind === "farm_share" || kind === "farm_loss_in") {
        await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
          source: kind === "farm_share" ? "farm_share" : "farm_loss",
          sourceId: movementId,
          amountBdt: going.amountBdt,
          occurredAt: startOfFarmDay(input.movedOn),
          counterpartyId: null,
          paymentMethod: input.paymentMethod,
        });
      }
      await reachesSettledOnLastPayout(
        tx,
        context.farm.id,
        row.id,
        audited(context).recordEvent,
        (inner) => readVenture(inner, context.farm.id, row.id)
      );
      return { paidBdt: going.amountBdt };
    }
  );
};

export const venturesRouter = {
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
      const rows = await context.db.query.venture.findMany({
        where: { farmId: context.farm.id },
        orderBy: { createdAt: "desc", id: "desc" },
      });
      const ids = rows.map((one) => one.id);
      const held = await heldByEach(context.db, context.farm.id, ids);
      const signed = await signedForEach(context.db, context.farm.id, ids);
      const checked = await bankStandingOf(context.db, context.farm.id, ids);
      const stillHers = await stillHersByEach(context.db, context.farm.id, ids);
      const settled = await context.db.query.ventureSettlement.findMany({
        where: { farmId: context.farm.id, ventureId: { in: ids } },
        columns: { ventureId: true },
      });
      const approved = new Set(settled.map((one) => one.ventureId));
      return rows.map((one) => ({
        ...ventureView(one, held.get(one.id), signed.get(one.id), {
          warnBelowBdt: context.farm.runningBudgetWarnBdt,
          bank: checked.get(one.id) ?? NEVER_CHECKED,
          windUpDays: context.farm.windUpDays,
          stillHers: stillHers.get(one.id) ?? 0,
        }),
        /** Whether its Settlement has been approved. From then every Investor is being paid on figures
         *  written down, so the acts that would move them — a month reimbursed, the Owner's own money in,
         *  the terms amended — are refused, and the screen should stop offering them. */
        settlementApproved: approved.has(one.id),
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
      const rows = await context.db.query.venture.findMany({
        where: { farmId: context.farm.id, state: { in: [...AT_WORK] } },
        orderBy: { createdAt: "desc", id: "desc" },
      });
      const ids = rows.map((one) => one.id);
      const [held, stillHers] = await Promise.all([
        heldByEach(context.db, context.farm.id, ids),
        stillHersByEach(context.db, context.farm.id, ids),
      ]);
      return rows.map((row) => {
        const budgets = budgetsOf(row, held.get(row.id));
        return {
          id: row.id,
          name: row.name,
          state: row.state,
          /** What its capital was planned as, and what is left of each side of it. */
          cattleBudgetBdt: budgets.cattleBudgetBdt,
          runningBudgetBdt: budgets.runningBudgetBdt,
          cattleBudgetHeldBdt: budgets.cattleBudgetHeldBdt,
          runningBudgetHeldBdt: budgets.runningBudgetHeldBdt,
          /** What its animals have cost it so far. */
          spentBdt: roundTaka(held.get(row.id)?.spentBdt ?? 0),
          runningBudgetLow:
            budgets.runningBudgetHeldBdt < context.farm.runningBudgetWarnBdt,
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
      if (plan.floorBdt > input.targetCapitalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Floor cannot be more than the capital the Venture is after",
          data: { refusal: "venture_floor_over_target" },
        });
      }
      // What the Units can raise is all the capital the farm will take for it, so a Floor above that is one
      // no signature could ever reach: the run would stay Open for ever, waiting on money it may not accept.
      if (plan.floorBdt > plan.units * input.unitPriceBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The Floor cannot be more than the Units can raise",
          data: { refusal: "venture_floor_over_units" },
        });
      }
      if (plan.cattleBudgetBdt > input.targetCapitalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Cattle Budget cannot be more than the capital it comes from",
          data: { refusal: "venture_budget_over_capital" },
        });
      }
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
            targetCapitalBdt: input.targetCapitalBdt,
            floorBdt: plan.floorBdt,
            decideBy: input.decideBy,
            targetWindowStart: input.targetWindowStart,
            targetWindowEnd: input.targetWindowEnd,
            unitPriceBdt: input.unitPriceBdt,
            units: plan.units,
            cattleBudgetBdt: plan.cattleBudgetBdt,
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

  /**
   * A Venture's **Venture Plan**: every version the Owner saved, the one in force, and the baseline it is measured
   * against, each with what it comes to (`planOf`). The Owner's alone, as a Venture's money is.
   */
  plan: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await planOf(context.db, context.farm.id, row);
    }),

  /**
   * A Venture measured against the plan it opened on (`planAgainstActual`): buying by band, growth and money beside
   * the baseline. The Owner's alone; nothing while it has no plan.
   */
  planAgainstActual: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
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

  /**
   * A new version of a Venture's plan: its buying lines by weight band and what a kilo will sell at. While it is Open
   * the Owner may change it as often as she likes; after buying begins each change is a revision with its reason, and
   * the plan made before stays what the Venture is measured against. An Audit Event each time.
   */
  setPlan: protectedProcedure
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
                  buyBdtPerKg: z.number().positive().max(100_000),
                  dailyGainKg: z.number().min(0).max(5),
                })
                .refine((line) => line.fromKg < line.toKg, {
                  message: "A band's lower weight is below its upper",
                  path: ["fromKg"],
                })
            )
            .min(1)
            .max(20),
          saleLowBdtPerKg: z.number().positive().max(100_000),
          saleHighBdtPerKg: z.number().positive().max(100_000),
          reason: z.string().trim().max(300).nullable().default(null),
        })
        .refine((one) => one.saleLowBdtPerKg <= one.saleHighBdtPerKg, {
          message: "The low price is above the high one",
          path: ["saleLowBdtPerKg"],
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
   * A Venture's **Projection** and the figures it is worked from (ADR 0010): what its Settlement might come to at the
   * Owner's low and high sale prices. The Owner's alone, like the rest of a Venture's money; nothing while no sale
   * prices are set.
   */
  projection: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
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

  /**
   * What the Owner expects of a Venture, which its Projection is worked from: the low and the high price a kilo of
   * live weight will sell at, and — for animals it has still to buy — the price a kilo, the weight each is bought at
   * and the gain a day. The Owner's own guesses, changed as the market moves, each change an Audit Event keeping what
   * was said before. Never a term of any Agreement.
   */
  setProjection: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z
        .object({
          ventureId: z.string(),
          saleLowBdtPerKg: z.number().positive().max(100_000),
          saleHighBdtPerKg: z.number().positive().max(100_000),
          buyBdtPerKg: z
            .number()
            .positive()
            .max(100_000)
            .nullable()
            .default(null),
          buyWeightKg: z.number().positive().max(2000).nullable().default(null),
          dailyGainKg: z.number().positive().max(5).nullable().default(null),
        })
        .refine((one) => one.saleLowBdtPerKg <= one.saleHighBdtPerKg, {
          message: "The low price is above the high one",
          path: ["saleLowBdtPerKg"],
        })
    )
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const figures = {
        saleLowBdtPerKg: input.saleLowBdtPerKg,
        saleHighBdtPerKg: input.saleHighBdtPerKg,
        buyBdtPerKg: input.buyBdtPerKg,
        buyWeightKg:
          input.buyWeightKg === null ? null : input.buyWeightKg.toFixed(2),
        dailyGainKg:
          input.dailyGainKg === null ? null : input.dailyGainKg.toFixed(2),
        setAt: context.clock.now(),
        setBy: context.session?.user.id ?? null,
      };
      await audited(context).write(
        {
          entity: "venture_projection",
          entityId: row.id,
          action: "update",
          before: (tx) => basisSnapshot(tx, context.farm.id, row.id),
          after: (tx) => basisSnapshot(tx, context.farm.id, row.id),
        },
        (tx) =>
          tx
            .insert(ventureProjection)
            .values({ ventureId: row.id, farmId: context.farm.id, ...figures })
            .onConflictDoUpdate({
              target: ventureProjection.ventureId,
              set: figures,
            })
      );
      return { ventureId: row.id };
    }),

  /**
   * A Venture's Requests to Join, each with its history beneath it, and beside them the Units signed and the Units
   * asked for and waiting — the Owner's to read, and nobody else's.
   */
  requests: protectedProcedure
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
  answerRequest: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ requestId: z.string(), answer: theAnswer }))
    .handler(({ context, input }) =>
      answerRequest(context, input.requestId, input.answer)
    ),

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
        columns: { unitPriceBdt: true },
      });
      const taken = new Map<string, number>();
      for (const one of await context.db.query.ventureMovement.findMany({
        where: {
          farmId: context.farm.id,
          agreementId: { in: rows.map((row) => row.id) },
          kind: "capital_in",
        },
        columns: { agreementId: true, amountBdt: true },
      })) {
        if (one.agreementId) {
          taken.set(
            one.agreementId,
            (taken.get(one.agreementId) ?? 0) + one.amountBdt
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
        /** Capital this paper may still take: its Units' worth, less what it has taken. */
        capitalLeftBdt: Math.max(
          0,
          one.units * (run?.unitPriceBdt ?? 0) - (taken.get(one.id) ?? 0)
        ),
        investorsPercent: one.investorsPercent,
        farmPercent: theFarmsShare(one.investorsPercent),
        targetWindow: {
          start: one.targetWindowStart,
          end: one.targetWindowEnd,
        },
        arbitrator: one.arbitrator,
        stamp: {
          kind: one.stampKind,
          valueBdt: one.stampValueBdt,
          on: one.stampedOn,
          serial: one.stampSerial,
        },
        hasPaper: kept.has(one.id),
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
        async (tx) => {
          // Every count is made inside the write's own transaction, behind a lock on the Farm row: the
          // Units left, the Investors standing and the Agreements that set the next Pay-in Code are only
          // true until the next signature commits, and a rule that may not be overridden may not be lost
          // to two phones at once either.
          await lockTheFarm(tx, context.farm.id);
          const signing = await tx.query.investor.findFirst({
            where: { id: input.investorId, farmId: context.farm.id },
            columns: { retiredAt: true },
          });
          if (signing?.retiredAt) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "This Investor is retired; bring them back before signing them for a Venture",
              data: { refusal: "investor_retired" },
            });
          }
          // One Agreement per person per Venture, as the unique index insists — said here in words, where the
          // index would only say "duplicate key".
          const already = await tx.query.investmentAgreement.findFirst({
            where: {
              farmId: context.farm.id,
              ventureId: input.ventureId,
              investorId: input.investorId,
            },
            columns: { id: true },
          });
          if (already) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This Investor has signed for this Venture already",
              data: { refusal: "investor_already_signed" },
            });
          }
          // The Request it answers reads signed in this same transaction, or the signing is refused with it; with none
          // named, a Request they had live reads signed all the same.
          await answerBySigning(
            tx,
            auditing.recordEvent,
            context.farm.id,
            {
              requestId: input.requestId,
              ventureId: input.ventureId,
              investorId: input.investorId,
            },
            now
          );
          const taken = await unitsTaken(tx, context.farm.id, input.ventureId);
          if (taken + input.units > row.units) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Only ${row.units - taken} Units of this Venture are left`,
              data: { refusal: "venture_units_gone" },
            });
          }
          const counted = await countedInvestors(tx, context.farm.id);
          const newcomer = !counted.unitsOf.has(input.investorId);
          if (newcomer && counted.standing >= context.farm.investorCap) {
            throw new ORPCError("BAD_REQUEST", {
              message: `The farm may have ${context.farm.investorCap} Investors at a time`,
              data: { refusal: "investor_cap_reached" },
            });
          }
          const given = await nextPayInCode(tx, context.farm.id, row);
          await tx.insert(investmentAgreement).values({
            id,
            farmId: context.farm.id,
            ventureId: input.ventureId,
            investorId: input.investorId,
            units: input.units,
            investorsPercent: input.investorsPercent,
            // The window the Venture means to sell in, as it stands today, written onto this paper.
            targetWindowStart: row.targetWindowStart,
            targetWindowEnd: row.targetWindowEnd,
            arbitrator: input.arbitrator,
            stampKind: input.stampKind,
            stampValueBdt: input.stampValueBdt,
            stampedOn: input.stampedOn,
            stampSerial: input.stampSerial,
            templateVersionId: wording.versionId,
            payInCode: given,
            requestId: input.requestId ?? null,
            signedBy: context.actor.id,
            createdAt: now,
          });
          // The Agreement is a Nomination too, for the Nominees it names.
          await nominationBySigning(tx, auditing.recordEvent, {
            farmId: context.farm.id,
            investorId: input.investorId,
            agreementId: id,
            signedOn: input.stampedOn,
            nominees,
            recordedBy: context.actor.id,
            now,
          });
          return given;
        }
      );
      // Said back to the Owner where they have just signed, for the Investor to write on the transfer.
      return { id, payInCode: code };
    }),

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
          await lockTheFarm(tx, context.farm.id);
          await assertNotSettledUp(tx, context.farm.id, row.id);
          const signed = await tx.query.investmentAgreement.findMany({
            where: { farmId: context.farm.id, ventureId: row.id },
            columns: { id: true },
            orderBy: { createdAt: "asc", id: "asc" },
          });
          if (signed.length === 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Nobody has signed for this Venture yet",
              data: { refusal: "nobody_has_signed" },
            });
          }
          await tx.insert(agreementAmendment).values(
            signed.map((one) => ({
              id: uuidv7(),
              farmId: context.farm.id,
              agreementId: one.id,
              amendedId,
              signedOn: input.signedOn,
              investorsPercent: input.investorsPercent,
              targetWindowStart: input.targetWindowStart,
              targetWindowEnd: input.targetWindowEnd,
              reason: input.reason,
              templateVersionId: wording.versionId,
              amendedBy: context.actor.id,
              createdAt: now,
            }))
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

  /**
   * The Ventures an Animal may be written against, by name and the state they are in: one still buying
   * takes an Intake, and one buying or fattening takes an Internal Sale.
   *
   * The Manager's as well as the Owner's, because the Manager records the Intake and the roles matrix
   * gives her the owner on it. What a Venture is planned by, what it holds and who is in it stay the
   * Owner's: this says only which names may be written against a beast today.
   */
  /**
   * The animals that may move from one purse to another, for the Owner choosing one: bought-in Fattening animals
   * still on the farm, not yet Ready for Sale, weighed at least once, and in a purse that still trades — the Farm's
   * own, or a Venture buying or fattening: the ones an Internal Sale would take —
   * with the purse each is in now and what she last weighed, which is what her price is struck on.
   *
   * The sale still asks every one of these again inside its lock: this is what to offer, not the permission.
   */
  movableAnimals: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .handler(async ({ context }) => {
      const rows = await context.db.query.animal.findMany({
        where: {
          farmId: context.farm.id,
          side: "fattening",
          source: "bought",
          state: { in: ["quarantine", "fattening"] },
        },
        columns: { id: true, tagNumber: true, state: true },
        with: {
          pen: { columns: { name: true } },
          owner: { columns: { id: true, name: true, state: true } },
          weighIns: {
            columns: { weightKg: true, weighedAt: true },
            orderBy: { weighedAt: "desc", id: "desc" },
            limit: 1,
          },
        },
        orderBy: { tagNumber: "asc", id: "asc" },
      });
      return rows.flatMap(({ weighIns, pen, owner, ...her }) => {
        const weighed = weighIns.at(0);
        const herPurseTrades =
          owner === null ||
          owner.state === "buying" ||
          owner.state === "fattening";
        return weighed && herPurseTrades
          ? [
              {
                ...her,
                penName: pen.name,
                /** Whose she is now: a Venture, or null for the Farm's own herd. */
                purse: owner ? { id: owner.id, name: owner.name } : null,
                weightKg: Number(weighed.weightKg),
                weighedAt: weighed.weighedAt,
              },
            ]
          : [];
      });
    }),

  takingAnimals: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.venture.findMany({
        where: {
          farmId: context.farm.id,
          state: { in: ["buying", "fattening"] },
        },
        columns: { id: true, name: true, state: true },
        orderBy: { createdAt: "desc", id: "desc" },
      });
      return rows;
    }),

  /**
   * The Investors' capital as it lands: which paper it came against, how much, the day the bank moved
   * it and the reference on the instrument.
   *
   * Never a Money Event. This is the Venture's money passing through an account in the Owner's name,
   * and the Farm's books would be lying if they counted it as income.
   */
  takeCapital: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(capitalInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.paymentMethod !== "bank") {
        // A Venture Account takes bank transfers, cheques and deposit slips. Cash nobody can prove is
        // exactly what an Investor's family would ask about years later.
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes capital by bank only",
          data: { refusal: "capital_must_be_by_bank" },
        });
      }
      const agreement = await theAgreement(context, input.agreementId);
      const row = await ours(context, agreement.ventureId);
      if (row.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes capital only while it is open",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const owed = agreement.units * row.unitPriceBdt;
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        async (tx) => {
          // Counted inside the write's own transaction and behind a lock on the Farm row, as signing
          // counts its Units: what an Agreement has taken is only true until the next payment commits,
          // and two arriving together each read a figure that still leaves room for the other. Capital
          // divides by Units, so a Unit paid for twice would take twice its share of the profit while
          // holding one share of the Venture.
          await lockTheFarm(tx, context.farm.id);
          const paidAlready = await takenAgainst(
            tx,
            context.farm.id,
            agreement.id
          );
          if (paidAlready + input.amountBdt > owed) {
            throw new ORPCError("BAD_REQUEST", {
              message: `This Agreement is for ${owed - paidAlready} more taka`,
              data: { refusal: "capital_over_units" },
            });
          }
          // Asked after the count, which is the order these two were refused in before the count moved
          // inside the lock: a payment that is both unpapered and over its Units hears the same of the
          // two things it heard before.
          const paper = await tx.query.agreementPaper.findFirst({
            where: { agreementId: agreement.id, farmId: context.farm.id },
            columns: { agreementId: true },
          });
          if (!paper) {
            throw new ORPCError("BAD_REQUEST", {
              message: "The stamped Agreement is not on file yet",
              data: { refusal: "agreement_has_no_paper" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: agreement.ventureId,
            kind: "capital_in",
            agreementId: agreement.id,
            amountBdt: input.amountBdt,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /**
   * The Buying Float: money drawn from a Venture Account for one Buying Trip, so the Manager goes to the
   * haat with money that is accounted for. By bank, like every movement of a Venture's money.
   *
   * Refused unless the Venture is buying, refused for more than its Cattle Budget is holding — feed
   * money is not spent on one more bull — and refused for a trip that has been given money already,
   * because a trip funded twice is a trip nobody can reconcile.
   */
  drawFloat: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        buyingTripId: z.string(),
        amountBdt: money.refine((taka) => taka > 0, {
          message: "A Float is money going out",
        }),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const row = await ours(context, input.ventureId);
      if (row.state !== "buying") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture draws a Float only while it is buying",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const trip = await context.db.query.buyingTrip.findFirst({
        where: { id: input.buyingTripId, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!trip) {
        throw new ORPCError("NOT_FOUND", { message: "No such outing" });
      }
      // An outing already bringing another Venture's animals home cannot be funded by this one: the
      // reconciliation counts the Animals bought on the trip for the Venture that paid, and money and
      // animals pointing at different Ventures is a sum nobody could ever make balance.
      const brought = await context.db.query.intake.findMany({
        where: { farmId: context.farm.id, buyingTripId: input.buyingTripId },
        columns: { animalId: true },
      });
      const owners = await theOwnersOf(
        context.db,
        brought.map((one) => one.animalId)
      );
      if (owners.some((owner) => owner !== null && owner !== row.id)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That outing is bringing another Venture's animals home",
          data: { refusal: "trip_is_another_ventures" },
        });
      }
      const id = uuidv7(now);
      await actOnVenture(context, {
        ventureId: row.id,
        // Read again inside the lock: a Venture moved on or called off while this was being filled in
        // would otherwise still hand out money.
        from: ["buying"],
        wrongState: "A Venture draws a Float only while it is buying",
        refusedOnceSettled: true,
        trail: {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        apply: async (tx, standing) => {
          // Counted inside the write, behind the same lock every other Venture count takes: what the
          // Cattle Budget holds is only true until the next Float commits.
          const held = await heldByEach(tx, context.farm.id, [row.id]);
          const view = ventureView(standing, held.get(row.id), undefined, {
            warnBelowBdt: context.farm.runningBudgetWarnBdt,
            bank: NEVER_CHECKED,
            windUpDays: context.farm.windUpDays,
            stillHers: 0,
          });
          if (input.amountBdt > view.cattleBudgetHeldBdt) {
            throw new ORPCError("BAD_REQUEST", {
              message: `The Cattle Budget is holding ${view.cattleBudgetHeldBdt}`,
              data: { refusal: "cattle_budget_short" },
            });
          }
          const already = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              buyingTripId: input.buyingTripId,
              kind: "float_out",
            },
            columns: { id: true },
          });
          if (already) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That outing has been given a Float already",
              data: { refusal: "float_already_drawn" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "float_out",
            buyingTripId: input.buyingTripId,
            amountBdt: input.amountBdt,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        },
      });
      return { id };
    }),

  /**
   * The Float counted when the trip comes home: what went out equals the Animals it bought for this
   * Venture, plus the outing's own costs, plus the cash brought back and deposited.
   *
   * A reconciliation that does not add up is refused, and says by how much and which way — a Float that
   * nearly balances is a Float nobody has actually counted. Once it is counted the outing is closed: no
   * animal and no cost may be added to it afterwards, because the sum it was counted against would stop
   * being true.
   */
  reconcileFloat: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        buyingTripId: z.string(),
        /** What came back and went into the bank. Nothing, when the whole Float was spent. */
        cashBackBdt: money,
        /** The day it was deposited, and the slip's number. Left out when nothing came back. */
        movedOn: farmDay.optional(),
        reference: z.string().trim().max(120).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.cashBackBdt > 0 && !(input.movedOn && input.reference)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Cash coming back needs the day and the deposit slip",
          data: { refusal: "cash_back_needs_a_slip" },
        });
      }
      const id = uuidv7(now);
      let counted = { animalsBdt: 0, tripBdt: 0, animals: 0 };
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          // What the Float was counted against, kept with the act rather than only returned to the
          // screen: an auditor years later asks what the Owner signed, not what she was shown.
          after: async (tx) => ({
            ...(await readMovement(tx, context.farm.id, id)),
            countedAgainst: counted,
          }),
        },
        async (tx) => {
          // Everything inside the write, behind the lock every count of a Venture's money takes: the
          // sum is only true until the next animal or the next cost lands on the outing.
          await lockTheFarm(tx, context.farm.id);
          const float = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              buyingTripId: input.buyingTripId,
              kind: "float_out",
            },
          });
          if (!float) {
            throw new ORPCError("NOT_FOUND", {
              message: "That outing was never given a Float",
            });
          }
          if (float.reconciledAt) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That Float has been reconciled already",
              data: { refusal: "float_already_reconciled" },
            });
          }
          await assertNotSettledUp(tx, context.farm.id, float.ventureId);
          const bought = await whatTheFloatBought(tx, context.farm.id, {
            buyingTripId: input.buyingTripId,
            ventureId: float.ventureId,
          });
          counted = bought;
          const accountedFor = roundTaka(
            bought.animalsBdt + bought.tripBdt + input.cashBackBdt
          );
          const outBdt = roundTaka(float.amountBdt);
          if (accountedFor !== outBdt) {
            const gapBdt = roundTaka(Math.abs(accountedFor - outBdt));
            throw new ORPCError("BAD_REQUEST", {
              message: `That is ${gapBdt} ${
                accountedFor > outBdt ? "more than" : "short of"
              } the Float`,
              data: {
                refusal: accountedFor > outBdt ? "float_over" : "float_short",
                gapBdt,
              },
            });
          }
          // The homecoming is its own movement even when nothing came back, because the record that the
          // Float was counted, and against what, is the point of counting it.
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: float.ventureId,
            kind: "float_back",
            buyingTripId: input.buyingTripId,
            amountBdt: input.cashBackBdt,
            movedOn: input.movedOn ?? float.movedOn,
            reference: input.reference ?? "",
            refundsId: float.id,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          await tx
            .update(ventureMovement)
            .set({ reconciledAt: now, reconciledBy: context.actor.id })
            .where(eq(ventureMovement.id, float.id));
        }
      );
      return { ...counted, cashBackBdt: input.cashBackBdt };
    }),

  /**
   * What a Buying Trip was given, and from which Venture. The Manager's as well as the Owner's: she is
   * the one taking it to the haat, and she may see what is in her hand without being able to draw it.
   */
  floatOf: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ buyingTripId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.ventureMovement.findFirst({
        where: {
          farmId: context.farm.id,
          buyingTripId: input.buyingTripId,
          kind: "float_out",
        },
        with: { venture: { columns: { name: true } } },
      });
      return row
        ? {
            id: row.id,
            ventureId: row.ventureId,
            ventureName: row.venture?.name ?? "",
            amountBdt: row.amountBdt,
            movedOn: row.movedOn,
            reference: row.reference,
          }
        : null;
    }),

  /**
   * An Animal sold between the Farm's herd and a Venture, or between two Ventures.
   *
   * Priced at her latest Weigh-in times a live-weight rate the Owner enters that day, with a note of
   * where the rate came from — an Investor asking years later why his bull was worth that is owed a
   * figure and a reason. The money moves through the Venture Account, because it is a sale and not a
   * book entry, and her owner changes with it.
   *
   * Refused once the Venture is selling and refused for an Animal who is Ready for Sale: a finished
   * bull may not be lifted out of the pool at the moment she becomes worth having.
   */
  sellInternally: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(20),
        /** Who takes her on: a Venture, or left out for the Farm's own herd. */
        toVentureId: z.string().optional(),
        /** Taka per kilogramme of live weight, as the day's market gives it. */
        rateBdtPerKg: z.number().positive().max(100_000),
        /** Where the rate came from. Asked for, not optional. */
        note: z.string().trim().min(1).max(300),
        soldOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        /** The transfer, cheque or deposit slip the money moved on. */
        reference: z.string().trim().min(1).max(120),
        /** The price the Owner read before she committed. Refused when it is not the price the farm
         *  works out, because she may be looking at a weight taken before this morning's round. */
        priceBdt: z.number().positive().max(100_000_000),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const id = uuidv7(now);
      let struck = { weightKg: 0, priceBdt: 0 };
      await audited(context).write(
        {
          entity: "internal_sale",
          entityId: id,
          action: "create",
          reason: input.note,
          after: (tx) => readInternalSale(tx, context.farm.id, id),
        },
        async (tx) => {
          // Everything inside the write, behind the lock every count of a Venture's money takes: she
          // may be marked Ready for Sale, or a Venture moved on, between reading and writing.
          await lockTheFarm(tx, context.farm.id);
          const her = await tx.query.animal.findFirst({
            where: {
              farmId: context.farm.id,
              tagNumber: input.tagNumber.toUpperCase(),
            },
            columns: {
              id: true,
              side: true,
              state: true,
              source: true,
              ownerVentureId: true,
            },
          });
          if (!her) {
            throw new ORPCError("NOT_FOUND", { message: "No such animal" });
          }
          if (her.side !== "fattening") {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Investor money funds Fattening, and a Dairy cow is the Farm's",
              data: { refusal: "not_a_fattening_animal" },
            });
          }
          if (her.source !== "bought") {
            throw new ORPCError("BAD_REQUEST", {
              message: "A Venture owns bought-in animals and no others",
              data: { refusal: "not_a_ventures_animal" },
            });
          }
          if (isExitState(her.state)) {
            // Sold, died or culled: there is no animal left to move, and a Venture paying for one would be paying
            // its Investors' money for a carcass.
            throw new ORPCError("BAD_REQUEST", {
              message: "She has left the farm, and there is no animal to move",
              data: { refusal: "she_is_gone" },
            });
          }
          if (her.state === "ready_for_sale") {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "She is ready for sale, and a finished bull is not moved between purses",
              data: { refusal: "she_is_ready_for_sale" },
            });
          }
          const from = her.ownerVentureId;
          const to = input.toVentureId ?? null;
          if (from === to) {
            throw new ORPCError("BAD_REQUEST", {
              message: "She is already theirs",
              data: { refusal: "already_that_purse" },
            });
          }
          await assertVentureMayTrade(tx, context.farm.id, from, "seller");
          await assertVentureMayTrade(tx, context.farm.id, to, "buyer");
          const weighed = await whatSheLastWeighed(tx, context.farm.id, her.id);
          if (!weighed) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "She has never been weighed, so there is no price to strike",
              data: { refusal: "never_weighed" },
            });
          }
          const priceBdt = priceAtWeight(weighed.weightKg, input.rateBdtPerKg);
          if (roundTaka(input.priceBdt) !== priceBdt) {
            // She was weighed again since the Owner read the figure: the price she is committing to is
            // not the price the farm would strike, and a sale is not something to guess at.
            throw new ORPCError("BAD_REQUEST", {
              message: `She last weighed ${weighed.weightKg} kg, so the price is ${priceBdt}`,
              data: { refusal: "weighed_again_since", priceBdt },
            });
          }
          if (to !== null) {
            // The buyer pays out of what it holds for cattle, exactly as it would at the haat.
            const held = await heldByEach(tx, context.farm.id, [to]);
            const buyer = await ours(context, to);
            const view = ventureView(buyer, held.get(to), undefined, {
              warnBelowBdt: context.farm.runningBudgetWarnBdt,
              bank: NEVER_CHECKED,
              windUpDays: context.farm.windUpDays,
              stillHers: 0,
            });
            if (priceBdt > view.cattleBudgetHeldBdt) {
              throw new ORPCError("BAD_REQUEST", {
                message: `The Cattle Budget is holding ${view.cattleBudgetHeldBdt}`,
                data: { refusal: "cattle_budget_short" },
              });
            }
          }
          struck = await recordInternalSale(
            tx,
            bookingOf(context, context.roleUsed, now),
            {
              id,
              animalId: her.id,
              from,
              to,
              weighed,
              rateBdtPerKg: input.rateBdtPerKg,
              note: input.note,
              soldOn: input.soldOn,
              paymentMethod: input.paymentMethod,
              reference: input.reference,
            }
          );
        }
      );
      return { id, ...struck, rateBdtPerKg: input.rateBdtPerKg };
    }),

  /**
   * The close-out of a Venture, shown before anything is done: what its Animals fetched, every charge as
   * its own line, the Owner's Advance, capital, the profit and what each Investor is owed.
   *
   * It comes back with whatever makes it a guess rather than refusing outright, because an Owner told
   * only "no" has nothing to go and put right — and because she is owed the shape of the answer while she
   * is chasing the last weigh-in that would finish it.
   */
  settlement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await settlementOf(
        context.db,
        context.farm.id,
        row,
        farmDayOf(context.clock.now())
      );
    }),

  /**
   * The Owner approving the Settlement, as one act, which writes the figures down as they stood.
   *
   * After this they do not move: a late cost or a Correction changes what the costing says and changes
   * nothing here, because what an Investor is shown a year later has to be what he was shown on the day.
   * Refused while anything about it is still a guess, in the same word the view was showing her.
   */
  approveSettlement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        note: z.string().trim().max(400).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      let settlementId = "";
      await audited(context).write(
        {
          entity: "venture_settlement",
          entityId: input.ventureId,
          action: "create",
          reason: input.note,
          after: (tx) => readSettlement(tx, context.farm.id, row.id),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          // Worked out again inside the lock and behind it: the figures written down must be the figures
          // as they stand at the moment of writing, not as they stood when a screen was drawn.
          const worked = await settlementOf(
            tx,
            context.farm.id,
            row,
            farmDayOf(now)
          );
          settlementId = await approveSettlement(
            tx,
            context.farm.id,
            row.id,
            worked,
            {
              actorId: context.actor.id,
              now,
            }
          );
          // A Venture that owes nobody anything is finished the moment it is approved, and must not be
          // left in Selling for ever waiting for a payment that will never be made.
          await reachesSettledOnLastPayout(
            tx,
            context.farm.id,
            row.id,
            audited(context).recordEvent,
            (inner) => readVenture(inner, context.farm.id, row.id)
          );
        }
      );
      return { id: settlementId };
    }),

  /**
   * What an approved Settlement says, and what has happened about it: each Investor's share, whether it
   * has gone out, and whether he has said he had it.
   */
  approvedSettlement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await readSettlement(context.db, context.farm.id, row.id);
    }),

  /**
   * One Investor paid what the approved Settlement owes him, by bank like every movement of a Venture's
   * money, with the day and the reference it went on — so that "I never got it" has an answer that is
   * not somebody's memory.
   *
   * After the Owner's Advance has gone back, because she put her own money in to feed their animals and
   * it comes back at cost before any capital returns.
   */
  paySettlement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        agreementId: z.string(),
        /** What the Owner read before she sent it. Refused when it is not what the paper says she owes:
         *  a figure typed from memory is how a payout goes out wrong. */
        amountBdt: z.number().positive().max(1_000_000_000),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(({ context, input }) =>
      moveSettlementMoney(context, input, "payout", (approved) => {
        if (
          approved.row.advanceRepaidId === null &&
          approved.row.advanceBdt !== 0
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Your own money comes back before any capital does",
            data: { refusal: "advance_comes_first" },
          });
        }
        const his = approved.shares.find(
          (one) => one.agreementId === input.agreementId
        );
        if (!his) {
          throw new ORPCError("NOT_FOUND", {
            message: "This Settlement owes nothing on that Agreement",
          });
        }
        if (his.paidMovementId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "That has already gone out",
            data: { refusal: "already_paid" },
          });
        }
        const owed = his.payoutBdt;
        if (owed <= 0) {
          // The run lost more than he put in, so there is nothing to send him. What he owes back is a
          // conversation, not a movement of the Venture's money.
          throw new ORPCError("BAD_REQUEST", {
            message: "This Settlement owes nothing on that Agreement",
            data: { refusal: "nothing_to_pay_him", owed },
          });
        }
        if (roundTaka(input.amountBdt) !== roundTaka(owed)) {
          throw new ORPCError("BAD_REQUEST", {
            message: `This Settlement owes ${owed} on that Agreement`,
            data: { refusal: "not_what_he_is_owed", owed },
          });
        }
        return {
          amountBdt: owed,
          mark: (tx: Tx, movementId: string) =>
            tx
              .update(ventureSettlementShare)
              .set({ paidMovementId: movementId })
              .where(
                and(
                  eq(ventureSettlementShare.id, his.id),
                  eq(ventureSettlementShare.farmId, context.farm.id)
                )
              ),
        };
      })
    ),

  /**
   * The Owner's own money back, at cost, out of the Venture's cash. Before any capital returns, because
   * she put it in to feed their animals and it earned her nothing for doing so.
   */
  repayAdvance: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(({ context, input }) =>
      moveSettlementMoney(context, input, "advance_repaid", (approved) => {
        if (approved.row.advanceRepaidId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Your Advance has already come back",
            data: { refusal: "already_paid" },
          });
        }
        const owed = approved.row.advanceBdt;
        if (owed === 0) {
          throw new ORPCError("BAD_REQUEST", {
            message: "You put nothing of your own into this Venture",
            data: { refusal: "no_advance_to_repay" },
          });
        }
        return {
          amountBdt: owed,
          mark: (tx: Tx, movementId: string) =>
            tx
              .update(ventureSettlement)
              .set({ advanceRepaidId: movementId })
              .where(
                and(
                  eq(ventureSettlement.id, approved.row.id),
                  eq(ventureSettlement.farmId, context.farm.id)
                )
              ),
        };
      })
    ),

  /**
   * The Farm's own share of the profit leaving the Venture Account for the Farm's books.
   *
   * The Farm's money never stays in a Venture Account, whosever name the account is in — the same reason
   * the Owner's Advance is sent back rather than left where it lies.
   */
  takeTheFarmsShare: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(({ context, input }) =>
      moveSettlementMoney(context, input, "farm_share", (approved) => {
        if (approved.row.farmSharePaidId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "The Farm's share has already been taken",
            data: { refusal: "already_paid" },
          });
        }
        const owed = approved.row.farmBdt;
        if (owed <= 0) {
          throw new ORPCError("BAD_REQUEST", {
            message: "This Venture made the Farm nothing to take",
            data: { refusal: "no_farm_share_to_take" },
          });
        }
        return {
          amountBdt: owed,
          mark: (tx: Tx, movementId: string) =>
            tx
              .update(ventureSettlement)
              .set({ farmSharePaidId: movementId })
              .where(
                and(
                  eq(ventureSettlement.id, approved.row.id),
                  eq(ventureSettlement.farmId, context.farm.id)
                )
              ),
        };
      })
    ),

  /**
   * The Farm's share of a loss, paid into the Venture Account from the Farm's own money.
   *
   * A run that lost money splits the loss as it would have split a profit, by the percentages its Agreements
   * froze: the Investors' part comes off the capital they get back, and the Farm's part is money the account
   * does not hold. Until the Farm puts it there, the payouts the Settlement wrote down add up to more than the
   * account has, and the run could never reach Settled. Paid once, and it closes the Farm's side of the
   * Settlement as taking a share of a profit does.
   */
  coverTheFarmsLoss: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(({ context, input }) =>
      moveSettlementMoney(context, input, "farm_loss_in", (approved) => {
        if (approved.row.farmSharePaidId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "The Farm's share of the loss has already been paid in",
            data: { refusal: "already_paid" },
          });
        }
        const owed = -approved.row.farmBdt;
        if (owed <= 0) {
          throw new ORPCError("BAD_REQUEST", {
            message: "This Venture made no loss for the Farm to carry",
            data: { refusal: "no_farm_loss_to_cover" },
          });
        }
        return {
          amountBdt: owed,
          mark: (tx: Tx, movementId: string) =>
            tx
              .update(ventureSettlement)
              .set({ farmSharePaidId: movementId })
              .where(
                and(
                  eq(ventureSettlement.id, approved.row.id),
                  eq(ventureSettlement.farmId, context.farm.id)
                )
              ),
        };
      })
    ),

  /**
   * An Investor saying he had his money, recorded against his payout — so the file shows who has
   * confirmed and who has not, rather than the Owner remembering.
   */
  acknowledgePayout: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        agreementId: z.string(),
        note: z.string().trim().max(300).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      await audited(context).write(
        {
          entity: "venture_settlement",
          entityId: row.id,
          action: "update",
          before: (tx) => readSettlement(tx, context.farm.id, row.id),
          after: (tx) => readSettlement(tx, context.farm.id, row.id),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          const approved = await approvedSettlementOf(
            tx,
            context.farm.id,
            row.id
          );
          const his = approved?.shares.find(
            (one) => one.agreementId === input.agreementId
          );
          if (!his) {
            throw new ORPCError("NOT_FOUND", {
              message: "This Settlement owes nothing on that Agreement",
            });
          }
          if (!his.paidMovementId) {
            throw new ORPCError("BAD_REQUEST", {
              message: "He cannot have had money nobody has sent him",
              data: { refusal: "not_yet_paid" },
            });
          }
          if (his.acknowledgedAt) {
            // Said once. A second saying would write over the day he said it and whatever he said.
            throw new ORPCError("BAD_REQUEST", {
              message: "He has already said he had it",
              data: { refusal: "already_acknowledged" },
            });
          }
          await tx
            .update(ventureSettlementShare)
            .set({
              acknowledgedAt: now,
              acknowledgedNote: input.note ?? null,
              acknowledgedBy: context.actor.id,
            })
            .where(
              and(
                eq(ventureSettlementShare.id, his.id),
                eq(ventureSettlementShare.farmId, context.farm.id)
              )
            );
        }
      );
      return { acknowledged: true as const };
    }),

  /**
   * Something that landed after the Settlement was approved, written down as an Adjustment.
   *
   * The Settlement's own figures never move and money already paid is never chased. This says what each
   * Investor's share would be now, and whether anything has to be done about it: above the figure the
   * Farm sets, a supplementary payout or a waiver; below it, noted and nothing moves, because a hundred
   * taka should not cost a trip to the bank.
   */
  raiseAdjustment: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        /** What arrived late, in the Owner's words. An Investor reading this years later is owed a
         *  reason and not only a figure. */
        reason: z.string().trim().min(1).max(400),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      return await audited(context).write(
        {
          entity: "venture_settlement",
          entityId: row.id,
          action: "update",
          reason: input.reason,
          before: (tx) => readSettlement(tx, context.farm.id, row.id),
          after: (tx) => readSettlement(tx, context.farm.id, row.id),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          const approved = await approvedSettlementOf(
            tx,
            context.farm.id,
            row.id
          );
          if (!approved) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Nothing to adjust until the Settlement is approved",
              data: { refusal: "not_yet_approved" },
            });
          }
          // Worked out the same way the Settlement was, so the two figures are comparable at all.
          const worked = await settlementOf(
            tx,
            context.farm.id,
            row,
            farmDayOf(now)
          );
          const against = adjustmentAgainst(approved.row, worked);
          if (against.investorsDifferenceBdt === 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Nothing has changed since this Settlement was approved",
              data: { refusal: "nothing_has_changed" },
            });
          }
          return await raiseAdjustment(
            tx,
            context.farm.id,
            approved.row.id,
            {
              reason: input.reason,
              thresholdBdt: context.farm.adjustmentThresholdBdt,
              against,
            },
            { actorId: context.actor.id, now }
          );
        }
      );
    }),

  /**
   * An outstanding Adjustment paid on top of what was settled: one supplementary payout for each
   * Investor whose Units gained by the late news, against the paper he holds.
   */
  payAdjustment: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        adjustmentId: z.string(),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      assertByBank(input.paymentMethod);
      return await audited(context).write(
        {
          entity: "venture_settlement",
          entityId: row.id,
          action: "update",
          before: (tx) => readSettlement(tx, context.farm.id, row.id),
          after: (tx) => readSettlement(tx, context.farm.id, row.id),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          const approved = await approvedSettlementOf(
            tx,
            context.farm.id,
            row.id
          );
          if (!approved) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Nothing to adjust until the Settlement is approved",
              data: { refusal: "not_yet_approved" },
            });
          }
          const adjustment = await theAdjustment(
            tx,
            context.farm.id,
            approved.row.id,
            input.adjustmentId
          );
          const perUnitBdt = adjustment.perUnitDifferenceBdt;
          if (perUnitBdt <= 0) {
            // The late news was bad. Nothing is chased: an Investor paid on figures the farm gave him
            // keeps what he was paid, so there is nothing to send and this is waived, not paid.
            throw new ORPCError("BAD_REQUEST", {
              message: "Nothing is owed on this Adjustment; waive it instead",
              data: { refusal: "nothing_to_pay_on_it" },
            });
          }
          // Less whatever earlier Adjustments already sent: each one restates the whole difference
          // since the Settlement, so paying all of it again would send the same good news twice.
          const raised = await adjustmentsOf(
            tx,
            context.farm.id,
            approved.row.id
          );
          // What this one still has to send, as the Adjustments themselves say it: worked out in one
          // place, so the screen offering to send a figure the farm then refuses cannot happen.
          const perUnitToPay =
            raised.find((one) => one.id === adjustment.id)?.perUnitToPayBdt ??
            0;
          if (perUnitToPay <= 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Earlier Adjustments have already paid this out",
              data: { refusal: "nothing_to_pay_on_it" },
            });
          }
          // The Farm's own money, on the Farm's own books: the Venture Account closed when the
          // Settlement was paid out, and news landing after that is the Farm's to make good. One event
          // for each Investor, named, because "what did he get and on what reference" is the whole
          // reason the Settlement's own payouts are recorded one by one.
          const people = await tx.query.investor.findMany({
            where: { farmId: context.farm.id },
            columns: { id: true, name: true },
          });
          const nameOf = new Map(people.map((one) => [one.id, one.name]));
          const booking = bookingOf(context, context.roleUsed, now);
          let paidBdt = 0;
          for (const his of approved.shares) {
            const amountBdt = roundTaka(perUnitToPay * his.units);
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one Investor at a time
            const counterpartyId = await counterpartyNamed(
              tx,
              context.farm.id,
              { name: nameOf.get(his.investorId) ?? his.investorId },
              now
            );
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one Investor at a time
            await bookMoney(tx, booking, {
              source: "settlement_adjustment",
              sourceId: `${adjustment.id}:${his.agreementId}`,
              amountBdt,
              occurredAt: startOfFarmDay(input.movedOn),
              counterpartyId,
              paymentMethod: input.paymentMethod,
            });
            paidBdt += amountBdt;
          }
          await closeAdjustment(
            tx,
            context.farm.id,
            adjustment.id,
            { outcome: "paid" },
            { actorId: context.actor.id, now }
          );
          return { paidBdt };
        }
      );
    }),

  /**
   * An outstanding Adjustment waived: the Owner deciding it is not worth moving money over, in words
   * she writes down and stands behind.
   */
  waiveAdjustment: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        adjustmentId: z.string(),
        /** Why she is letting it go. Asked for, not optional: a waiver nobody explained is a decision
         *  nobody can answer for later. */
        note: z.string().trim().min(1).max(400),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      await audited(context).write(
        {
          entity: "venture_settlement",
          entityId: row.id,
          action: "update",
          reason: input.note,
          before: (tx) => readSettlement(tx, context.farm.id, row.id),
          after: (tx) => readSettlement(tx, context.farm.id, row.id),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          const approved = await approvedSettlementOf(
            tx,
            context.farm.id,
            row.id
          );
          const adjustment = await theAdjustment(
            tx,
            context.farm.id,
            approved?.row.id ?? "",
            input.adjustmentId
          );
          await closeAdjustment(
            tx,
            context.farm.id,
            adjustment.id,
            { outcome: "waived", waivedNote: input.note },
            { actorId: context.actor.id, now }
          );
        }
      );
      return { waived: true as const };
    }),

  /**
   * What a Venture still holds, each with what she last weighed, so the Owner can work the buy-back out
   * before she commits to it rather than read the total off a receipt.
   *
   * An Animal nobody has weighed comes back with nothing where her weight should be, which is the same
   * answer the buy-back refuses on — said while there is still time to put her on the scale.
   */
  whatIsLeft: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const hers = await stillHersOf(context.db, context.farm.id, row.id);
      const weights = await Promise.all(
        hers.map((her) =>
          whatSheLastWeighed(context.db, context.farm.id, her.id)
        )
      );
      return {
        windUpEndsOn: windUpEndsOn(
          row.targetWindowEnd,
          context.farm.windUpDays
        ),
        animals: hers.map((her, at) => ({
          tagNumber: her.tagNumber,
          weightKg: weights[at]?.weightKg ?? null,
        })),
      };
    }),

  /**
   * The buy-back at wind-up: the Wind-up Period has ended, animals are still standing, and the Farm takes
   * every one of them off the Venture at weight so it can settle on time.
   *
   * Its own act at a fixed moment, and not the Owner's discretionary Internal Sale — which is refused
   * once a Venture is Selling precisely so a finished bull cannot be lifted out of the pool. The
   * difference is the moment: this happens because the clock says so and takes everything left, where an
   * Internal Sale is the Owner choosing one animal on a day of her choosing. Priced the same way all the
   * same, because a price an Investor can check is the same price either way.
   */
  buyWhatIsLeft: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        /** Taka per kilogramme of live weight, as the day's market gives it. One rate for the lot: it
         *  is one act on one day, and each animal's own weight is what makes her price her own. */
        rateBdtPerKg: z.number().positive().max(100_000),
        /** Where the rate came from. Asked for, not optional. */
        note: z.string().trim().min(1).max(300),
        boughtOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        /** The transfer, cheque or deposit slip the money moved on. */
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      // Read once for the Audit Event's subject; everything the act turns on is read again under the
      // lock, because a Venture can be called off between the two.
      const row = await ours(context, input.ventureId);
      let bought: { tagNumber: string; weightKg: number; priceBdt: number }[] =
        [];
      await audited(context).write(
        {
          entity: "venture",
          entityId: row.id,
          action: "update",
          reason: input.note,
          before: (tx) => readVenture(tx, context.farm.id, row.id),
          after: (tx) => readVenture(tx, context.farm.id, row.id),
        },
        async (tx) => {
          // Behind the lock every count of a Venture's money takes, and everything the act turns on is
          // read after it: one of them may be sold at the haat, or the Venture called off, between
          // reading which are left and buying them.
          await lockTheFarm(tx, context.farm.id);
          await assertNotSettledUp(tx, context.farm.id, row.id);
          const held = await tx.query.venture.findFirst({
            where: { id: row.id, farmId: context.farm.id },
            columns: { state: true, targetWindowEnd: true },
          });
          // A run still going, whichever stage it is at. One that never sold a single bull is exactly
          // the case the clock exists for — but one called off has sent its money back, and one settled
          // has closed its books, and neither takes animals off anybody.
          if (!(held && isRunning(held.state))) {
            throw new ORPCError("BAD_REQUEST", {
              message: `A Venture is bought out while it is running, and this one is ${held?.state}`,
              data: { refusal: "venture_wrong_state" },
            });
          }
          const endsOn = windUpEndsOn(
            held.targetWindowEnd,
            context.farm.windUpDays
          );
          if (farmDayOf(now) <= endsOn) {
            throw new ORPCError("BAD_REQUEST", {
              message: `The Wind-up Period runs to ${endsOn}`,
              data: { refusal: "wind_up_not_over", endsOn },
            });
          }
          if (input.boughtOn <= endsOn) {
            // The day it is booked on is what the movements, the Money Event and every month's books
            // read off. Left free, the Owner could wait a day and then write the buy-back back inside
            // the very period it is only allowed to happen after.
            throw new ORPCError("BAD_REQUEST", {
              message: `The Wind-up Period runs to ${endsOn}, so it cannot have happened on ${input.boughtOn}`,
              data: { refusal: "wind_up_not_over", endsOn },
            });
          }
          const hers = await stillHersOf(tx, context.farm.id, row.id);
          if (hers.length === 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This Venture has no animals left to buy",
              data: { refusal: "nothing_left_to_buy" },
            });
          }
          const taken: typeof bought = [];
          for (const her of hers) {
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            const weighed = await whatSheLastWeighed(
              tx,
              context.farm.id,
              her.id
            );
            if (!weighed) {
              // Her tag in the message, because a price nobody can defend is worse than a delay. The
              // Owner is told which animal to put on the scale before she gets here, by the list the
              // sheet reads from `whatIsLeft` — this is the farm refusing to guess all the same.
              throw new ORPCError("BAD_REQUEST", {
                message: `${her.tagNumber} has never been weighed, so there is no price to strike`,
                data: { refusal: "never_weighed", tagNumber: her.tagNumber },
              });
            }
            const saleId = uuidv7(now);
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            const struck = await recordInternalSale(
              tx,
              bookingOf(context, context.roleUsed, now),
              {
                id: saleId,
                animalId: her.id,
                from: row.id,
                to: null,
                weighed,
                rateBdtPerKg: input.rateBdtPerKg,
                note: input.note,
                soldOn: input.boughtOn,
                paymentMethod: input.paymentMethod,
                reference: input.reference,
              }
            );
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            const after = await readInternalSale(tx, context.farm.id, saleId);
            // Its own Audit Event, as an Internal Sale made one at a time has: what the Owner is asked
            // years later is why this bull was worth that, not what the day came to.
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal at a time
            await audited(context).recordEvent(
              tx,
              {
                entity: "internal_sale",
                entityId: saleId,
                action: "create",
                reason: input.note,
              },
              { after }
            );
            taken.push({
              tagNumber: her.tagNumber,
              weightKg: struck.weightKg,
              priceBdt: struck.priceBdt,
            });
          }
          bought = taken;
        }
      );
      return {
        animals: bought,
        totalBdt: roundTaka(bought.reduce((sum, one) => sum + one.priceBdt, 0)),
        rateBdtPerKg: input.rateBdtPerKg,
      };
    }),

  /**
   * What the farm thinks a Venture Account held at a month's end, so the Owner has something to hold the
   * bank's statement against before she writes anything down.
   */
  expectedAtMonthEnd: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string(), month: monthInput }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const expectedBdt = await balanceAtMonthEnd(
        context.db,
        context.farm.id,
        row.id,
        input.month
      );
      const already = await context.db.query.ventureBankCheck.findFirst({
        where: {
          farmId: context.farm.id,
          ventureId: row.id,
          forMonth: input.month,
        },
      });
      return {
        expectedBdt,
        checked: already
          ? {
              readBdt: already.readBdt,
              /** What the farm believed when she read the statement, which is not `expectedBdt` once
               *  something has moved in that month since. */
              expectedBdt: already.expectedBdt,
              note: already.note,
              stale: roundTaka(expectedBdt - already.expectedBdt) !== 0,
            }
          : null,
      };
    }),

  /**
   * The month's bank check: what the Venture Account really held, off the bank's own statement, against
   * what the farm thinks it should have held.
   *
   * A month that disagrees is kept as disagreeing. The Owner writes down what she found out about it
   * rather than making it agree, and a Settlement will not close over one — a mistake caught in weeks is
   * one somebody can still remember, and the same mistake at settlement is a figure nobody can unpick.
   */
  checkTheBank: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        month: monthInput,
        /** What the statement said. Signed, because a statement can read below nothing and the farm
         *  would rather be told than have the figure refused. */
        readBdt: z.number().min(-1_000_000_000).max(1_000_000_000),
        /** What she has found out about a difference, where she has found out anything. */
        note: z.string().trim().max(400).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      const { until } = monthOf(startOfFarmDay(`${input.month}-01`));
      if (until > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is not over yet",
          data: { refusal: "month_not_over" },
        });
      }
      if (input.month < farmDayOf(row.createdAt).slice(0, 7)) {
        // A month the Venture did not exist in would read straight against nothing, and a Venture
        // nobody has really checked would look as though somebody had.
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is before this Venture opened",
          data: { refusal: "month_before_the_venture" },
        });
      }
      let expectedBdt = 0;
      // Read for the label alone: whether the trail calls this a first reading or a month put right.
      // What is written is decided inside the lock, so a race can mislabel the act but never the row.
      const readBefore = await context.db.query.ventureBankCheck.findFirst({
        where: { id: idOfTheMonth(context.farm.id, row.id, input.month) },
        columns: { id: true },
      });
      await audited(context).write(
        {
          entity: "venture_bank_check",
          entityId: idOfTheMonth(context.farm.id, row.id, input.month),
          action: readBefore ? "update" : "create",
          reason: input.note,
          before: (tx) =>
            readBankCheck(
              tx,
              context.farm.id,
              idOfTheMonth(context.farm.id, row.id, input.month)
            ),
          after: (tx) =>
            readBankCheck(
              tx,
              context.farm.id,
              idOfTheMonth(context.farm.id, row.id, input.month)
            ),
        },
        async (tx) => {
          // Inside the write, behind the lock its neighbours take: the figure the farm believes is only
          // true until the next movement commits, and two readings of one month must not race into two
          // rows.
          await lockTheFarm(tx, context.farm.id);
          expectedBdt = await balanceAtMonthEnd(
            tx,
            context.farm.id,
            row.id,
            input.month
          );
          const already = await tx.query.ventureBankCheck.findFirst({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
            },
          });
          // A month found to disagree does not come right by being typed again. She may put a misread
          // figure right, but she says what she found out when she does — that is the difference
          // between correcting a reading and quietly making a problem go away.
          const disagreed =
            already !== undefined &&
            roundTaka(already.readBdt - already.expectedBdt) !== 0;
          const agreesNow = roundTaka(input.readBdt - expectedBdt) === 0;
          // Said now, not once before: the note she wrote when it disagreed explains the disagreement,
          // and putting the month right is a different thing to explain.
          if (disagreed && !input.note) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Say what you found out about the month that did not agree",
              data: { refusal: "say_what_you_found_out" },
            });
          }
          await tx
            .insert(ventureBankCheck)
            .values({
              id: idOfTheMonth(context.farm.id, row.id, input.month),
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
              readBdt: input.readBdt,
              expectedBdt,
              note: input.note ?? null,
              checkedBy: context.actor.id,
              checkedAt: now,
            })
            .onConflictDoUpdate({
              target: ventureBankCheck.id,
              set: {
                readBdt: input.readBdt,
                expectedBdt,
                // Kept unless she says something new: re-reading a month must not erase what she
                // found out about it last time. Dropped once the month agrees, because what she found
                // out was about a difference that is no longer there.
                note:
                  input.note ?? (agreesNow ? null : (already?.note ?? null)),
                checkedBy: context.actor.id,
                checkedAt: now,
              },
            });
        }
      );
      return {
        expectedBdt,
        readBdt: input.readBdt,
        differenceBdt: roundTaka(input.readBdt - expectedBdt),
      };
    }),

  /**
   * The Owner's Advance: her own money into a Venture whose Running Budget has run out, so the animals
   * keep eating. Interest-free, never a charge against the Venture, and repaid at cost before any
   * capital returns — which the Settlement will do.
   *
   * It is a movement of the Venture's account and never a Money Event: the Farm has not spent anything
   * and has not earned anything, the Owner has lent her own money to a run she is looking after.
   */
  advance: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        amountBdt: money.refine((taka) => taka > 0, {
          message: "An Advance is money going in",
        }),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const id = uuidv7(now);
      await actOnVenture(context, {
        ventureId: input.ventureId,
        // A Venture that has not started buying has eaten nothing, and one whose run is over has
        // nothing left to feed. An Advance into either would be the Owner's money with no way home:
        // calling a Venture off returns capital, and only capital.
        from: RUNNING_STATES,
        wrongState: "A Venture takes an Advance only while it is running",
        refusedOnceSettled: true,
        trail: {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        apply: async (tx, standing) => {
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: standing.id,
            kind: "advance",
            amountBdt: input.amountBdt,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        },
      });
      return { id };
    }),

  /**
   * What a Venture's cattle are doing: how many stand, how many have gone, what they weighed off the
   * lorry and what they weigh now, what they are putting on in a day, and how many days until the
   * Target Window opens.
   *
   * The Manager reads it as well as the Owner — the roles matrix gives them a Venture's figures, and
   * this is figures about animals they look after every day. What it does not carry is a single word
   * about Investors or what any of them holds.
   *
   * No projection in any of it. The fattening board works out where a rate lands a bull at the window
   * and whether that makes his target, and the Owner is welcome to that; this is the reading an
   * Investor's paper is made from, and a future weight on a sheet he keeps reads as a promise.
   */
  herd: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await theirProgress(
        context.db,
        context.farm.id,
        row,
        context.clock.now()
      );
    }),

  /**
   * Which of a Venture's bulls earned and which did not: each one's Margin and Cost of Gain, and the
   * herd's own.
   *
   * The Owner's alone. The Manager reads the herd's weights because he looks after them every day; what
   * a beast made is the money side of a Venture, and that is hers. An Investor never sees it either —
   * he is told what the whole run cost and what it fetched, not which bull disappointed.
   */
  economics: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const [costs, mine] = await Promise.all([
        farmCosts(context.db, context.farm.id),
        context.db.query.animal.findMany({
          where: { farmId: context.farm.id, ownerVentureId: row.id },
          columns: { id: true },
        }),
      ]);
      return economicsOfHerd(costs, new Set(mine.map((one) => one.id)));
    }),

  /**
   * What a Venture's Animals consumed in a month, and what it is made of — before anything is moved, so
   * the Owner sees the figure and its parts and can read them to an Investor.
   */
  consumption: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string(), month: monthInput }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await whatItsAnimalsConsumed(context, row.id, input.month);
    }),

  /**
   * The month's Reimbursement: what this Venture's Animals ate of the Farm's feed, were dosed with of
   * the Farm's medicine, cost in vet visits, and their share of the month's Herd Costs — moved from the
   * Venture Account to the Farm's.
   *
   * One act, both sides. A movement out of the Venture, and a Money Event **in** on the Farm's purse
   * under its own Category — gross, not netted: the Farm's expense when it bought the feed stands, and
   * the Venture's repayment stands beside it. This is also how home-grown fodder settles, which the Farm
   * never paid cash for and is genuinely selling.
   */
  reimburse: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        month: monthInput,
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
        /** The figure the Owner read before she committed. Refused when it is not what the farm works
         *  out now — a Feeding entered late, or a Category re-marked, moves the sum she was shown. */
        amountBdt: money,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      assertByBank(input.paymentMethod);
      const row = await ours(context, input.ventureId);
      if (hasEnded(row.state)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture whose run is over pays for nothing more",
          data: { refusal: "venture_wrong_state" },
        });
      }
      // The month has to be over. Reimbursing a month still running would take a part-month figure and
      // then lock the rest of it out for good, because a Venture is reimbursed once a month.
      const { until } = monthOf(startOfFarmDay(`${input.month}-01`));
      if (until > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is not over yet",
          data: { refusal: "month_not_over" },
        });
      }
      const consumed = await whatItsAnimalsConsumed(
        context,
        row.id,
        input.month
      );
      if (roundTaka(input.amountBdt) !== consumed.totalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message: `That month now comes to ${consumed.totalBdt}`,
          data: { refusal: "amount_changed", totalBdt: consumed.totalBdt },
        });
      }
      if (consumed.totalBdt <= 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Its animals consumed nothing that month",
          data: { refusal: "nothing_to_reimburse" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          reason: input.month,
          after: async (tx) => ({
            ...(await readMovement(tx, context.farm.id, id)),
            madeOf: consumed.madeOf,
          }),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          await assertNotSettledUp(tx, context.farm.id, row.id);
          const already = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
            },
            columns: { id: true },
          });
          if (already) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That month has been reimbursed already",
              data: { refusal: "month_already_reimbursed" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "reimbursement",
            forMonth: input.month,
            amountBdt: consumed.totalBdt,
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          // The Farm's side, on the Farm's purse: it bought the feed and is being paid for it.
          await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
            source: "reimbursement",
            sourceId: id,
            amountBdt: consumed.totalBdt,
            occurredAt: startOfFarmDay(input.movedOn),
            counterpartyId: null,
            paymentMethod: input.paymentMethod,
          });
        }
      );
      return { id, ...consumed };
    }),

  /**
   * A movement of a Venture's money put right: how much moved, the day the bank moved it, or the
   * reference on the instrument. A Correction like any other — a reason, and the trail holding what it
   * said before.
   *
   * Refused where the farm has already built something on it: a Float counted home, a month reimbursed,
   * a Venture settled. Changing a figure underneath a decision somebody has already made is not putting
   * anything right.
   */
  correctMovement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(ventureMovementCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, ventureMovementCorrection, input)
    ),

  /** Every movement of one Venture's money, oldest first: what came in, and what went back. */
  movements: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.ventureMovement.findMany({
        where: { farmId: context.farm.id, ventureId: input.ventureId },
        orderBy: { movedOn: "asc", id: "asc" },
      });
      if (rows.length === 0) {
        return [];
      }
      // Only the movements that belong to one Investor's paper have one; a Float belongs to none.
      const papers = rows.flatMap((one) =>
        one.agreementId ? [one.agreementId] : []
      );
      const agreements =
        papers.length === 0
          ? []
          : await context.db.query.investmentAgreement.findMany({
              where: { farmId: context.farm.id, id: { in: papers } },
              columns: { id: true, investorId: true },
            });
      const whose = new Map(
        agreements.map((one) => [one.id, one.investorId] as const)
      );
      // What a Correction would be refused for, row by row, by the one rule the Correction refuses by — so the
      // list offers Correct only where the farm will take it.
      const run = await context.db.query.venture.findFirst({
        where: { id: input.ventureId, farmId: context.farm.id },
        columns: { state: true },
      });
      const countedTrips = new Set(
        rows.flatMap((one) =>
          one.kind === "float_out" &&
          one.reconciledAt !== null &&
          one.buyingTripId
            ? [one.buyingTripId]
            : []
        )
      );
      // The animal a sale's money, or an Internal Sale's, was for — so the row names her and reaches her page.
      const tagOf = await tagsOfHerRecords(context.db, context.farm.id, {
        saleIds: rows.flatMap((one) => (one.saleId ? [one.saleId] : [])),
        internalSaleIds: rows.flatMap((one) =>
          one.internalSaleId ? [one.internalSaleId] : []
        ),
      });
      return rows.map((one) => ({
        id: one.id,
        kind: one.kind,
        /** The animal it was for, where it was a Sale's or an Internal Sale's money. */
        tagNumber: tagOf.get(one.saleId ?? one.internalSaleId ?? "") ?? null,
        /** Which way it moved the account, so a list of them can be added up to the balance the farm keeps. */
        direction: directionOf(one.kind),
        agreementId: one.agreementId,
        investorId: one.agreementId
          ? (whose.get(one.agreementId) ?? null)
          : null,
        buyingTripId: one.buyingTripId,
        amountBdt: one.amountBdt,
        movedOn: one.movedOn,
        reference: one.reference,
        refundsId: one.refundsId,
        /** Why it may not be put right, as the farm's word for it; null where it may. */
        whyItStands:
          whyItStands(
            one,
            run?.state,
            one.buyingTripId !== null && countedTrips.has(one.buyingTripId)
          )?.refusal ?? null,
      }));
    }),

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
            amountBdt: one.amountBdt,
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
        }
      );
      return { state: "cancelled" as const, refunded: sentBack };
    }),
};
