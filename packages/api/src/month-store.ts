import type { Database } from "@OpenFarm/db";
import type {
  FinancialYear,
  PenHistoryLine,
  YearRules,
} from "@OpenFarm/domain";
import {
  farmDayOf,
  financialYearStarting,
  financialYearsBack,
  litersPerCowMilked,
  milkPriceOf,
  monthHasBegun,
  monthOf,
  monthsEndingIn,
  monthsFromTo,
  monthsOfFinancialYear,
  roundMoney,
  startOfFarmDay,
  summarizeMoney,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import {
  chargedOf,
  costsBySide,
  farmCosts,
  narrowedToEach,
  boughtInOf,
  theFarmsOwn,
} from "./cost-store";
import { moneyForTheAccountant } from "./money-export-store";
import { THE_FARMS_PURSE } from "./money-store";
import type { OverheadMoneyOn } from "./overhead-store";
import { overheadMoneyIn, overheadsOf } from "./overhead-store";
import { fetchedPerLiter, writtenOffByItem } from "./receivable-store";
import { approvedSettlementOf } from "./settlement-store";
import { planAgainstActual } from "./venture-plan-store";
import { ownedThenByOf } from "./venture-store";
import { yearRulesOf } from "./year-store";

/** How far back the Owner reads the farm month by month: a year, this month among them. */
export const MONTHS_READ = 12;

/** A "YYYY-MM" month as the farm's own days begin and end it. */
const rangeOf = (month: string) => monthOf(startOfFarmDay(`${month}-01`));

/** Each Venture that has not been called off, against the plan it opened on: what the plan said it would make, what it
 *  is projected to make now while it runs, and what it made once it settled. */
const venturesAgainstPlan = async (
  db: Database,
  farm: { id: string; ventureInvestorsPercent: number },
  now: Date
) => {
  const rows = await db.query.venture.findMany({
    where: { farmId: farm.id, state: { ne: "canceled" } },
    orderBy: { ordinal: "asc" },
  });
  return await Promise.all(
    rows.map(async (row) => {
      const [measured, settled] = await Promise.all([
        planAgainstActual(db, farm.id, row, farm.ventureInvestorsPercent, now),
        row.state === "settled"
          ? approvedSettlementOf(db, farm.id, row.id)
          : null,
      ]);
      return {
        id: row.id,
        ordinal: row.ordinal,
        name: row.name,
        state: row.state,
        /** What its plan said it would make, low and high; nothing where it has no plan. */
        planned: measured?.money.planned ?? null,
        /** What it is projected to make now, low and high; nothing once it has ended. */
        projected: measured?.money.projected ?? null,
        /** What its approved Settlement says it made; nothing until then. */
        settledProfitMoney: settled?.row.profitMoney ?? null,
      };
    })
  );
};

/** What a stretch of the monthly report is read as once (`readOver`), and every month in it is cut from. */
interface Read {
  costs: Awaited<ReturnType<typeof farmCosts>>;
  money: Awaited<ReturnType<typeof moneyForTheAccountant>>;
  dispatched: {
    id: string;
    dispatchedAt: Date;
    liters: string;
    pricePerLiterMoney: string;
  }[];
  /** What stays written off of each Dispatch: milk a buyer never paid for did not fetch its price. */
  writtenOff: ReadonlyMap<string, number>;
  overheadMoney: OverheadMoneyOn[];
  /** Where every Animal stood, the Ventures' too: the place and the people keep them all, so an Overhead a head a day
   *  is over all of them, where the Sides' figures are over the Farm's own. */
  everyAnimal: PenHistoryLine[];
  now: Date;
}

/**
 * One stretch of the farm — a month, or the whole year — as the pages these come from say it: the accountant's income
 * and expense of the Farm's purse, the milk its Dispatches sold with what a liter fetched, and Costs by Side over the
 * same days, narrowed to the Farm's own animals. Worked over the stretch itself rather than added up from its months, so a year's cost a liter is its
 * costs over its liters, not a mean of twelve.
 */
const figuresOver = (
  { from, until }: { from: Date; until: Date },
  {
    costs,
    money,
    dispatched,
    writtenOff,
    overheadMoney,
    everyAnimal,
    now,
  }: Read
) => {
  const within = (at: Date) => at >= from && at < until;
  const sides = costsBySide(costs, { from, until });
  const cash = summarizeMoney(money.filter((one) => within(one.occurredAt)));
  const milk = milkPriceOf(
    dispatched
      .filter((one) => within(one.dispatchedAt))
      .map((one) => ({
        liters: Number(one.liters),
        pricePerLiterMoney: fetchedPerLiter(one, writtenOff),
      }))
  );
  const sold = sides.soldFattening.animals;
  const overheads = overheadsOf(
    overheadMoney,
    everyAnimal,
    { from, until },
    now
  );
  return {
    money: {
      inMoney: cash.incomeMoney,
      outMoney: cash.expenseMoney,
      netMoney: cash.netMoney,
      /** Money Events in it still waiting for the Owner, counted in the figures above as the accountant's are. */
      awaitingCount: cash.awaiting.count,
    },
    dairy: {
      milkSoldMoney: milk?.amount ?? 0,
      litersSold: milk?.liters ?? 0,
      /** What a liter fetched; nothing where no milk left. */
      fetchedPerLiterMoney: milk?.moneyPerLiter ?? null,
      /** Everything charged to the dairy side's animals in it. */
      chargedMoney: roundMoney(chargedOf(sides.dairy)),
      litersToBulk: sides.dairy.litersToBulk,
      /** Liters to Bulk for each cow milked, a day: what the herd gives a cow, apart from how many it has. */
      litersPerCowMilked: litersPerCowMilked(costs.liters, { from, until }),
      costPerLiterMoney: sides.dairy.costPerLiterMoney,
      unpricedKg: sides.dairy.unpricedKg,
      uncostedDoses: sides.dairy.uncostedDoses,
    },
    fattening: {
      /** Everything charged to the fattening side's animals in it, sold or standing. */
      chargedMoney: roundMoney(chargedOf(sides.fattening)),
      sold: sold.length,
      /** The whole-life Margins of the fattening animals sold in it; nothing where none was. */
      marginMoney: sold.length === 0 ? null : sides.soldFattening.marginMoney,
      unpricedKg: sides.fattening.unpricedKg,
      uncostedDoses: sides.fattening.uncostedDoses,
    },
    /** What running the place cost in it, and a head a day — charged to no Side above. */
    overheads: {
      amount: overheads.totalMoney,
      perHeadPerDayMoney: overheads.perHeadPerDayMoney,
    },
  };
};

/** The day the Farm's purse first moved a taka, or today for a farm whose purse has moved nothing yet. */
const firstDayKept = async (db: Database, farmId: string, today: string) => {
  const first = await db.query.moneyEvent.findFirst({
    where: { farmId, purseVentureId: THE_FARMS_PURSE },
    orderBy: { occurredAt: "asc" },
    columns: { occurredAt: true },
  });
  const firstDay = first ? farmDayOf(first.occurredAt) : today;
  return firstDay < today ? firstDay : today;
};

/**
 * The financial years the farm has kept money in, newest first: this one, back to the year of the first taka its purse
 * ever moved, each its own length (ADR 0016, 0017). This year alone for a farm whose purse has moved nothing yet.
 */
const financialYearsKept = async (
  db: Database,
  farmId: string,
  rules: YearRules,
  today: string
): Promise<FinancialYear[]> => {
  const firstDay = await firstDayKept(db, farmId, today);
  return financialYearsBack(rules, today, firstDay);
};

/** The months a report reads: the last `MONTHS_READ`, or a financial year's months that have begun — all of a year
 *  gone by, and this year's up to this month. A month no year begins in, or a year still to come, is refused. */
const monthsRead = (
  rules: YearRules,
  today: string,
  financialYear?: string
): { months: string[]; year: FinancialYear | null } => {
  if (financialYear === undefined) {
    return { months: monthsEndingIn(today, MONTHS_READ), year: null };
  }
  const year = financialYearStarting(rules, financialYear);
  if (!year) {
    throw new ORPCError("BAD_REQUEST", {
      message: `No financial year begins in ${financialYear}`,
      data: { refusal: "no_such_financial_year" },
    });
  }
  if (!monthHasBegun(year.start, today)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The financial year beginning ${financialYear} has not begun`,
      data: { refusal: "financial_year_not_begun" },
    });
  }
  return {
    months: monthsOfFinancialYear(year).filter((month) =>
      monthHasBegun(month, today)
    ),
    year,
  };
};

/**
 * Everything a stretch of the monthly report is cut from, read once: the Farm's costs narrowed to its own animals, as
 * its purse is its own money — a Venture's are on its own line — the purse's money, the milk dispatched, what stays
 * written off, the Overheads, and where every Animal stood.
 */
const readOver = async (
  db: Database,
  farmId: string,
  span: { from: Date; until: Date },
  now: Date
): Promise<Read> => {
  const [costs, ownedThenBy, money, dispatched, overheadMoney] =
    await Promise.all([
      farmCosts(db, farmId),
      ownedThenByOf(db, farmId),
      moneyForTheAccountant(db, farmId, span),
      db.query.dispatch.findMany({
        where: {
          farmId,
          dispatchedAt: { gte: span.from, lt: span.until },
        },
        columns: {
          id: true,
          dispatchedAt: true,
          liters: true,
          pricePerLiterMoney: true,
        },
      }),
      overheadMoneyIn(db, farmId, span),
    ]);
  return {
    costs: theFarmsOwn(costs, ownedThenBy, await boughtInOf(db, farmId)),
    money,
    dispatched,
    writtenOff: await writtenOffByItem(db, farmId),
    overheadMoney,
    everyAnimal: costs.history,
    now,
  };
};

/**
 * The farm month by month, for the Owner: the last `MONTHS_READ` months, or the financial year asked for, oldest
 * first, this one so far, and the year they make together — with the financial years there are to ask for.
 *
 * Nothing here is a sum of its own. Each is the accountant's income and expense of the Farm's purse, the milk its
 * Dispatches sold with what a liter fetched, and Costs by Side — what the dairy cows and the fattening animals were
 * charged, what a liter cost, and the Margins of the fattening animals sold — so a month here reads the same as the
 * same month on the pages those come from, but for one thing: as the purse is the Farm's own money, the animals are
 * the Farm's own, and a Venture's are left to its own line rather than counted twice. Money and costs stay apart: the
 * purse is what moved, and a Side's charges are what its animals ate and were dosed with, bought whenever.
 */
export const monthByMonth = async (
  db: Database,
  farm: { id: string; ventureInvestorsPercent: number },
  now: Date,
  financialYear?: string
) => {
  const today = farmDayOf(now);
  const rules = await yearRulesOf(db, farm.id);
  const { months, year: asked } = monthsRead(rules, today, financialYear);
  const span = {
    from: rangeOf(months[0] ?? "").from,
    until: rangeOf(months.at(-1) ?? "").until,
  };
  const [read, ventures, financialYears] = await Promise.all([
    readOver(db, farm.id, span, now),
    venturesAgainstPlan(db, farm, now),
    financialYearsKept(db, farm.id, rules, today),
  ]);
  // Each month's charges sorted out of the year's once, rather than every month reading all of them.
  const ranges = months.map(rangeOf);
  const narrowed = narrowedToEach(read.costs, [...ranges, span]);
  const over = (range: { from: Date; until: Date }, index: number) =>
    figuresOver(range, { ...read, costs: narrowed[index] ?? read.costs });
  return {
    months: months.map((month, index) => {
      const range = ranges[index] ?? rangeOf(month);
      return {
        month,
        /** This month, still going: its figures are what it has come to so far. */
        soFar: range.until > now,
        ...over(range, index),
      };
    }),
    /** The months together, worked over the whole of them. */
    year: over(span, months.length),
    /** The financial year these months are, or nothing for the last `MONTHS_READ`. */
    financialYear: asked,
    /** The financial years there are to ask for, newest first: this one first. */
    financialYears,
    ventures,
  };
};

/** The Ventures that ran in a stretch: opened before it ended, and not settled before it began. One called off is left
 *  out, whenever it was: the farm keeps no day it was called off on, so the months it ran cannot be told. */
const venturesRunningIn = async (
  db: Database,
  farmId: string,
  { from, until }: { from: Date; until: Date }
) => {
  const [rows, settled] = await Promise.all([
    db.query.venture.findMany({
      where: { farmId, state: { ne: "canceled" }, createdAt: { lt: until } },
      orderBy: { ordinal: "asc" },
      columns: { id: true, ordinal: true, name: true, state: true },
    }),
    db.query.ventureSettlement.findMany({
      where: { farmId },
      columns: { ventureId: true, approvedAt: true },
    }),
  ]);
  const settledAt = new Map(
    settled.map((one) => [one.ventureId, one.approvedAt])
  );
  return rows.filter((row) => {
    const ended = settledAt.get(row.id);
    return !ended || ended >= from;
  });
};

/**
 * One month of the farm, for the Owner: its figures as the monthly report says them, beside the month before's, its
 * money by Category and by Side as the accountant's summary adds the same days, the months there are to read — back to
 * the month of the first taka the purse moved — and the Ventures that ran in it, each keeping its own accounts. A month
 * still to come is refused; one before the farm kept anything reads as nothing.
 */
export const aMonth = async (
  db: Database,
  farm: { id: string },
  now: Date,
  month: string
) => {
  const today = farmDayOf(now);
  if (!monthHasBegun(month, today)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${month} has not begun`,
      data: { refusal: "month_not_begun" },
    });
  }
  const [before = month] = monthsEndingIn(`${month}-01`, 2);
  const range = rangeOf(month);
  const earlier = rangeOf(before);
  const span = { from: earlier.from, until: range.until };
  const [read, ventures, firstDay] = await Promise.all([
    readOver(db, farm.id, span, now),
    venturesRunningIn(db, farm.id, range),
    firstDayKept(db, farm.id, today),
  ]);
  const [thisMonth, monthBefore] = narrowedToEach(read.costs, [range, earlier]);
  // One for each range, always: a month falling back on the whole stretch's costs would say two months as one.
  if (!(thisMonth && monthBefore)) {
    throw new Error("Expected the month's costs and the month before's");
  }
  const within = (at: Date) => at >= range.from && at < range.until;
  const money = summarizeMoney(
    read.money.filter((one) => within(one.occurredAt))
  );

  return {
    month,
    /** The month before it, which it is set beside. */
    before,
    /** This month, still going: its figures are what it has come to so far. */
    soFar: range.until > now,
    figures: figuresOver(range, { ...read, costs: thisMonth }),
    figuresBefore: figuresOver(earlier, { ...read, costs: monthBefore }),
    /** The month's money as the accountant adds it: by Category, and by Side. */
    moneyBy: { category: money.byCategory, side: money.bySide },
    /** The months there are to read, newest first: this one back to the month of the first taka the purse moved. */
    monthsKept: monthsFromTo(
      firstDay.slice(0, 7),
      today.slice(0, 7)
    ).toReversed(),
    /** The Ventures that ran in it: each keeps its own accounts, and has its own month. */
    ventures,
  };
};
