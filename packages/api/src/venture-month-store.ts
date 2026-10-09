import type { Database } from "@OpenFarm/db";
import type { VentureMovementKind } from "@OpenFarm/db/schema/venture-account";
import {
  chargesOfOwner,
  costsOf,
  farmDayOf,
  farmDaysApart,
  herdBetween,
  monthHasBegun,
  monthBefore,
  monthOf,
  monthsFromTo,
  plannedHeadKg,
  roundMoney,
  roundedCosts,
  startOfFarmDay,
  sumsStandingOf,
} from "@OpenFarm/domain";
import type { FarmIdentity, Said, VentureMonthFacts } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { hasGoneStale } from "./bank-standing";
import {
  boughtInOf,
  costToItsOwner,
  farmCosts,
  owedByMonth,
} from "./cost-store";
import { KEEPING_THEM } from "./investor-statement-store";
import { madeOn } from "./paper-values";
import type { ChargeWord } from "./settlement-store";
import { CHARGED_LINE, CHARGED_WORDS } from "./settlement-store";
import { ventureHoldingsOf } from "./venture-herd-store";
import { planOf } from "./venture-plan-store";
import {
  balanceAtMonthEnd,
  directionOf,
  lastDayOf,
  ownedThenByOf,
  paidForBy,
} from "./venture-store";

/** A "YYYY-MM" month as the farm's own days begin and end it, the end not counted in. */
const rangeOf = (month: string) => monthOf(startOfFarmDay(`${month}-01`));

/**
 * The months a Venture ran: from the month it was opened to the later of the month its Settlement was approved and the
 * month its last money moved — its payouts follow the approval — or, called off, the month its last money moved, as the
 * farm keeps no day it was called off on; or this month while it runs.
 */
const monthsItRan = (
  opened: Date,
  ended: {
    settledAt: Date | null;
    calledOff: boolean;
    lastMovedOn: string | null;
  },
  today: string
) => {
  let last = today.slice(0, 7);
  if (ended.settledAt || ended.calledOff) {
    // Its payouts, and the Bank Check that reads them, move after the Settlement is approved: to its last money.
    const settledIn = ended.settledAt
      ? farmDayOf(ended.settledAt).slice(0, 7)
      : farmDayOf(opened).slice(0, 7);
    const movedIn = (ended.lastMovedOn ?? farmDayOf(opened)).slice(0, 7);
    last = movedIn > settledIn ? movedIn : settledIn;
  }
  return monthsFromTo(farmDayOf(opened).slice(0, 7), last);
};

/** A Venture paid by the month, to a month's end: what its Agreements had due, had paid and had missed, together. */
const monthlySumsTo = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  run: { id: string; unitPriceMoney: number },
  monthly: NonNullable<ReturnType<typeof paidForBy>["monthly"]>,
  lastDay: string
) => {
  const [agreements, paidIn] = await Promise.all([
    tx.query.investmentAgreement.findMany({
      where: { farmId, ventureId: run.id },
      columns: { id: true, units: true },
    }),
    tx.query.ventureMovement.findMany({
      where: {
        farmId,
        ventureId: run.id,
        kind: "capital_in",
        movedOn: { lte: lastDay },
      },
      columns: { agreementId: true, amountMoney: true },
    }),
  ]);
  const standing = agreements.map((one) =>
    sumsStandingOf({
      units: one.units,
      unitPriceMoney: run.unitPriceMoney,
      monthly,
      paidMoney: paidIn
        .filter((paid) => paid.agreementId === one.id)
        .reduce((sum, paid) => sum + paid.amountMoney, 0),
      today: lastDay,
    })
  );
  return {
    dueMoney: roundMoney(standing.reduce((sum, one) => sum + one.dueMoney, 0)),
    paidMoney: roundMoney(
      paidIn.reduce((sum, paid) => sum + paid.amountMoney, 0)
    ),
    missedMoney: roundMoney(
      standing.reduce((sum, one) => sum + one.missedMoney, 0)
    ),
  };
};

/**
 * Each animal sold in a stretch while one Venture's, against what she cost it: her price less her cost to it — her price
 * on the way in, or the Internal Sale's that bought her across, and every charge since — never a Margin, which is a whole
 * life whoever owned her.
 */
const soldIn = async (
  db: Database,
  farmId: string,
  ventureId: string,
  range: { from: Date; until: Date },
  {
    costs,
    ownedThenBy,
    boughtIn,
  }: {
    costs: Awaited<ReturnType<typeof farmCosts>>;
    ownedThenBy: Awaited<ReturnType<typeof ownedThenByOf>>;
    boughtIn: Awaited<ReturnType<typeof boughtInOf>>;
  }
) => {
  const sold = await db.query.sale.findMany({
    where: { farmId, soldAt: { gte: range.from, lt: range.until } },
    columns: { animalId: true, soldAt: true, priceMoney: true },
    orderBy: { soldAt: "asc", id: "asc" },
  });
  const animalOf = new Map(costs.animals.map((one) => [one.id, one]));
  return sold.flatMap((one) => {
    const her = animalOf.get(one.animalId);
    if (!her || ownedThenBy(one.animalId, one.soldAt) !== ventureId) {
      return [];
    }
    const across = boughtIn.get(one.animalId);
    const costMoney = costToItsOwner(
      costs,
      ownedThenBy,
      her,
      ventureId,
      across?.toVentureId === ventureId ? across : undefined
    );
    return [
      {
        tagNumber: her.tagNumber,
        soldAt: one.soldAt,
        priceMoney: one.priceMoney,
        costMoney,
        lessCostMoney:
          costMoney === null ? null : roundMoney(one.priceMoney - costMoney),
      },
    ];
  });
};

/**
 * A Venture Account over a month: from the month before's end to its own, each kind of Venture Movement dated in it, in
 * or out, and the month's Bank Check beside it — matched, differing, or stale where the books have moved since it was
 * read, as every Bank Check is judged (`hasGoneStale`).
 */
const accountIn = (
  movements: readonly {
    kind: VentureMovementKind;
    amountMoney: number;
    movedOn: string;
  }[],
  { firstDay, lastDay }: { firstDay: string; lastDay: string },
  openingMoney: number,
  closingMoney: number,
  bankCheck: { readMoney: number; expectedMoney: number } | undefined
) => {
  const byKind = new Map<VentureMovementKind, number>();
  for (const one of movements) {
    if (one.movedOn >= firstDay && one.movedOn <= lastDay) {
      byKind.set(one.kind, (byKind.get(one.kind) ?? 0) + one.amountMoney);
    }
  }
  const stale =
    bankCheck !== undefined &&
    hasGoneStale(closingMoney, bankCheck.expectedMoney);
  return {
    openingMoney,
    moved: [...byKind.entries()].map(([kind, amountMoney]) => ({
      kind,
      direction: directionOf(kind),
      amountMoney: roundMoney(amountMoney),
    })),
    closingMoney,
    bankCheck: bankCheck
      ? {
          readMoney: bankCheck.readMoney,
          expectedMoney: bankCheck.expectedMoney,
          matched:
            !stale &&
            roundMoney(bankCheck.readMoney - bankCheck.expectedMoney) === 0,
          stale,
        }
      : null,
  };
};

/**
 * One month of one Venture, the Owner's alone: the month beside the run to its end — the run worked over its whole
 * stretch and rounded once, never added up from months.
 *
 * Its animals as they stood (`herdBetween`); its charges by the Settlement's own lines, cut to the month from the very
 * charges the Settlement adds (`chargesOfOwner`), so the two can never disagree; its account from the month before's
 * end, each kind of Venture Movement dated in it, to its own end, beside the month's Bank Check; the Reimbursement the
 * month owes the Farm; each animal sold in it against what she cost the Venture; its plan to the month's end; and, paid
 * by the month, its Monthly Sums. No profit, no share, no Margin and no Projection, which a month cannot tell.
 *
 * Asked for no month, its latest. Refused for a month still to come, and for one after its run ended; one before it
 * opened reads as nothing, as a month before the farm kept anything does.
 */
export const ventureMonth = async (
  db: Database,
  farm: { id: string },
  ventureId: string,
  asked: string | undefined,
  now: Date
) => {
  const farmId = farm.id;
  const today = farmDayOf(now);
  const run = await db.query.venture.findFirst({
    where: { id: ventureId, farmId },
  });
  if (!run) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  const [settled, lastMoved] = await Promise.all([
    db.query.ventureSettlement.findFirst({
      where: { farmId, ventureId },
      columns: { approvedAt: true },
    }),
    db.query.ventureMovement.findFirst({
      where: { farmId, ventureId },
      orderBy: { movedOn: "desc", id: "desc" },
      columns: { movedOn: true },
    }),
  ]);
  const months = monthsItRan(
    run.createdAt,
    {
      settledAt: settled?.approvedAt ?? null,
      calledOff: run.state === "canceled",
      lastMovedOn: lastMoved?.movedOn ?? null,
    },
    today
  );
  const month = asked ?? months.at(-1) ?? today.slice(0, 7);
  if (!monthHasBegun(month, today)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${month} has not begun`,
      data: { refusal: "month_not_begun" },
    });
  }
  if (month > (months.at(-1) ?? month)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The Venture's run had ended before ${month}`,
      // With the months it did run, newest first, so a screen can go to one.
      data: { refusal: "venture_not_running", months: months.toReversed() },
    });
  }
  const range = rangeOf(month);
  const firstDay = `${month}-01`;
  const lastDay = lastDayOf(month);
  const [costs, ownedThenBy, boughtIn, holdings, movements, bankCheck] =
    await Promise.all([
      farmCosts(db, farmId),
      ownedThenByOf(db, farmId),
      boughtInOf(db, farmId),
      ventureHoldingsOf(db, farmId, ventureId),
      // Every movement, a later month's too: the month's Reimbursement may be repaid after it, and reads as repaid.
      db.query.ventureMovement.findMany({
        where: { farmId, ventureId },
        orderBy: { movedOn: "asc", id: "asc" },
        columns: {
          kind: true,
          amountMoney: true,
          movedOn: true,
          forMonth: true,
          carried: true,
        },
      }),
      db.query.ventureBankCheck.findFirst({
        where: { farmId, ventureId, forMonth: month },
        columns: { readMoney: true, expectedMoney: true },
      }),
    ]);
  const [opening, closing] = await Promise.all([
    balanceAtMonthEnd(db, farmId, ventureId, monthBefore(firstDay)),
    balanceAtMonthEnd(db, farmId, ventureId, month),
  ]);

  // The Venture's charges picked out once, then cut: the month's, and the run's to the month's end.
  const theirs = chargesOfOwner(costs.charges, ventureId, ownedThenBy);
  const inMonth = roundedCosts(
    costsOf(
      theirs.filter((one) => one.at >= range.from && one.at < range.until)
    )
  );
  const toEnd = roundedCosts(
    costsOf(theirs.filter((one) => one.at < range.until))
  );
  // Bought: each Intake theirs as it came off the lorry, and each Internal Sale it paid for, by the day each was.
  const intakes = costs.animals.flatMap((one) =>
    one.intake && ownedThenBy(one.id, one.intake.arrivedAt) === ventureId
      ? [{ at: one.intake.arrivedAt, money: one.intake.purchasePriceMoney }]
      : []
  );
  const boughtAcross = movements.filter(
    (one) => one.kind === "internal_buy" && one.movedOn <= lastDay
  );
  const boughtMoney = (inTheMonthOnly: boolean) =>
    roundMoney(
      intakes
        .filter(
          (one) =>
            one.at < range.until && (!inTheMonthOnly || one.at >= range.from)
        )
        .reduce((sum, one) => sum + one.money, 0) +
        boughtAcross
          .filter((one) => !inTheMonthOnly || one.movedOn >= firstDay)
          .reduce((sum, one) => sum + one.amountMoney, 0)
    );
  // The Settlement's own lines, in its order, from the one map of its words to the costing's lines.
  const charges = [
    {
      line: "bought" as ChargeWord,
      monthMoney: boughtMoney(true),
      toEndMoney: boughtMoney(false),
    },
    ...CHARGED_WORDS.map((line) => ({
      line,
      monthMoney: inMonth[CHARGED_LINE[line]],
      toEndMoney: toEnd[CHARGED_LINE[line]],
    })),
  ];

  // Its Reimbursement, as the books owe it: what the month comes to, paid, and still owed.
  const [reimbursement] = owedByMonth(
    costs,
    ownedThenBy,
    ventureId,
    [month],
    movements
      .filter((one) => one.kind === "reimbursement")
      .map((one) => ({
        forMonth: one.forMonth,
        amountMoney: one.amountMoney,
        carried: one.carried,
      }))
  );

  const soldInIt = await soldIn(db, farmId, ventureId, range, {
    costs,
    ownedThenBy,
    boughtIn,
  });

  const herd = herdBetween(holdings, range);

  // Against its plan to the month's end: heads and money bought, running spend, and the weight the plan meant them to
  // have reached by then against the weight they had.
  const plan = await planOf(db, farmId, run, lastDay);
  // The Running Budget's own words, as the plan's page spends it: what the animals cost while they stand here.
  const runningSpentMoney = roundMoney(
    charges
      .filter((one) => KEEPING_THEM.has(one.line))
      .reduce((sum, one) => sum + one.toEndMoney, 0)
  );
  // A month still going is read to today, or its plan's weight would be set beside the weight weeks before it.
  const readTo = lastDay < today ? lastDay : today;
  const daysSinceBuying = Math.max(
    0,
    Math.min(plan.daysOnFeed, farmDaysApart(run.decideBy, readTo))
  );
  const againstPlan = plan.baseline
    ? {
        plannedHeads: plan.baseline.totals.animals,
        boughtHeads: holdings.filter((one) => one.from < range.until).length,
        plannedCattleMoney: plan.baseline.totals.costMoney,
        boughtMoney: boughtMoney(false),
        plannedRunningMoney: run.targetCapitalMoney - run.cattleBudgetMoney,
        runningSpentMoney,
        plannedKg: plannedHeadKg(plan.baseline.lines, daysSinceBuying),
        reachedKg: herd.atEndKg?.averageKg ?? null,
      }
    : null;

  // Paid by the month: what was due, paid and missed to the month's end, every Agreement together.
  const { monthly } = paidForBy(run);
  const sums = monthly
    ? await monthlySumsTo(db, farmId, run, monthly, readTo)
    : null;

  return {
    month,
    soFar: range.until > now,
    /** The months there are to read, newest first: those it ran in. */
    months: months.toReversed(),
    venture: { id: run.id, name: run.name, state: run.state },
    herd,
    charges,
    account: accountIn(
      movements,
      { firstDay, lastDay },
      opening,
      closing,
      bankCheck
    ),
    reimbursement: reimbursement ?? null,
    sold: soldInIt,
    againstPlan,
    sums,
  };
};

/** Each Venture Movement's kind by the word the farm's screens call it — the Venture's money tab's own — named
 *  exhaustively, so a new kind fails to compile here rather than printing a key. */
const KIND_KEY = {
  capital_in: "ventures.kind.capitalIn",
  refund: "ventures.kind.refund",
  float_out: "ventures.kind.floatOut",
  float_back: "ventures.kind.floatBack",
  intake_out: "ventures.kind.intakeOut",
  internal_buy: "ventures.kind.internalBuy",
  internal_sell: "ventures.kind.internalSell",
  sale_in: "ventures.kind.saleIn",
  reimbursement: "ventures.kind.reimbursement",
  advance: "ventures.kind.advance",
  payout: "ventures.kind.payout",
  advance_repaid: "ventures.kind.advanceRepaid",
  farm_share: "ventures.kind.farmShare",
  farm_loss_in: "ventures.kind.farmLossIn",
  made_good: "ventures.kind.madeGood",
} as const satisfies Record<VentureMovementKind, MessageKey>;

/** Each of the Settlement's lines by the word the Owner's screens call it — not an Investor's paper's — named
 *  exhaustively. */
const CHARGE_KEY = {
  bought: "costs.bought",
  market_toll: "costs.market_toll",
  trips: "costs.trips",
  feed: "ventures.feed",
  medicine: "ventures.medicine",
  vet: "ventures.vet",
  herd: "ventures.herdCosts",
} as const satisfies Record<ChargeWord, MessageKey>;

/** A catalog word in both languages, for a paper read in either (ADR 0021). */
const bothOf = (key: MessageKey): Said => ({
  bn: translate("bn", key),
  en: translate("en", key),
});

/**
 * One month of one Venture as its paper prints it (`ventureMonthPaper`), from the month as `ventureMonth` works it:
 * the Settlement's lines and each kind of movement worded in both languages as the Owner's screens word them, each sale on
 * its farm day. The days it
 * covers come with it, as an Export records them: the month, or — still going — to today.
 */
export const ventureMonthFacts = (
  one: Awaited<ReturnType<typeof ventureMonth>>,
  farm: FarmIdentity,
  produced: { at: Date; by: string }
): { facts: VentureMonthFacts; days: { from: string; to: string } } => {
  const today = farmDayOf(produced.at);
  return {
    facts: {
      farm,
      ventureName: one.venture.name,
      month: one.month,
      soFarTo: one.soFar ? today : null,
      herd: one.herd,
      charges: one.charges.map((charge) => ({
        label: bothOf(CHARGE_KEY[charge.line]),
        monthMoney: charge.monthMoney,
        toEndMoney: charge.toEndMoney,
      })),
      account: {
        ...one.account,
        moved: one.account.moved.map((moved) => ({
          label: bothOf(KIND_KEY[moved.kind]),
          direction: moved.direction,
          amountMoney: moved.amountMoney,
        })),
      },
      reimbursement: one.reimbursement,
      sold: one.sold.map((sold) => ({
        tagNumber: sold.tagNumber,
        soldOn: farmDayOf(sold.soldAt),
        priceMoney: sold.priceMoney,
        costMoney: sold.costMoney,
        lessCostMoney: sold.lessCostMoney,
      })),
      againstPlan: one.againstPlan,
      sums: one.sums,
      producedAt: madeOn(produced.at),
      producedBy: produced.by,
    },
    days: {
      from: `${one.month}-01`,
      to: one.soFar ? today : lastDayOf(one.month),
    },
  };
};
