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
  litresPerCowMilked,
  milkPriceOf,
  monthHasBegun,
  monthOf,
  monthsEndingIn,
  monthsOfFinancialYear,
  roundMoney,
  startOfFarmDay,
  summariseMoney,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import {
  chargedOf,
  costsBySide,
  farmCosts,
  narrowedToEach,
  theFarmsOwn,
} from "./cost-store";
import { moneyForTheAccountant } from "./money-export-store";
import { THE_FARMS_PURSE } from "./money-store";
import type { OverheadMoneyOn } from "./overhead-store";
import { overheadMoneyIn, overheadsOf } from "./overhead-store";
import { fetchedPerLitre, writtenOffByItem } from "./receivable-store";
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
    where: { farmId: farm.id, state: { ne: "cancelled" } },
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

/** What `monthByMonth` reads once and every range is cut from. */
interface Read {
  costs: Awaited<ReturnType<typeof farmCosts>>;
  money: Awaited<ReturnType<typeof moneyForTheAccountant>>;
  dispatched: {
    id: string;
    dispatchedAt: Date;
    litres: string;
    pricePerLitreMoney: string;
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
 * and expense of the Farm's purse, the milk its Dispatches sold with what a litre fetched, and Costs by Side over the
 * same days, narrowed to the Farm's own animals. Worked over the stretch itself rather than added up from its months, so a year's cost a litre is its
 * costs over its litres, not a mean of twelve.
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
  const cash = summariseMoney(money.filter((one) => within(one.occurredAt)));
  const milk = milkPriceOf(
    dispatched
      .filter((one) => within(one.dispatchedAt))
      .map((one) => ({
        litres: Number(one.litres),
        pricePerLitreMoney: fetchedPerLitre(one, writtenOff),
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
      litresSold: milk?.litres ?? 0,
      /** What a litre fetched; nothing where no milk left. */
      fetchedPerLitreMoney: milk?.moneyPerLitre ?? null,
      /** Everything charged to the dairy side's animals in it. */
      chargedMoney: roundMoney(chargedOf(sides.dairy)),
      litresToBulk: sides.dairy.litresToBulk,
      /** Litres to Bulk for each cow milked, a day: what the herd gives a cow, apart from how many it has. */
      litresPerCowMilked: litresPerCowMilked(costs.litres, { from, until }),
      costPerLitreMoney: sides.dairy.costPerLitreMoney,
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
  const first = await db.query.moneyEvent.findFirst({
    where: { farmId, purseVentureId: THE_FARMS_PURSE },
    orderBy: { occurredAt: "asc" },
    columns: { occurredAt: true },
  });
  const firstDay = first ? farmDayOf(first.occurredAt) : today;
  return financialYearsBack(rules, today, firstDay < today ? firstDay : today);
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
 * The farm month by month, for the Owner: the last `MONTHS_READ` months, or the financial year asked for, oldest
 * first, this one so far, and the year they make together — with the financial years there are to ask for.
 *
 * Nothing here is a sum of its own. Each is the accountant's income and expense of the Farm's purse, the milk its
 * Dispatches sold with what a litre fetched, and Costs by Side — what the dairy cows and the fattening animals were
 * charged, what a litre cost, and the Margins of the fattening animals sold — so a month here reads the same as the
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
  const [
    costs,
    ownedThenBy,
    money,
    dispatched,
    ventures,
    overheadMoney,
    financialYears,
  ] = await Promise.all([
    farmCosts(db, farm.id),
    ownedThenByOf(db, farm.id),
    moneyForTheAccountant(db, farm.id, span),
    db.query.dispatch.findMany({
      where: {
        farmId: farm.id,
        dispatchedAt: { gte: span.from, lt: span.until },
      },
      columns: {
        id: true,
        dispatchedAt: true,
        litres: true,
        pricePerLitreMoney: true,
      },
    }),
    venturesAgainstPlan(db, farm, now),
    overheadMoneyIn(db, farm.id, span),
    financialYearsKept(db, farm.id, rules, today),
  ]);
  // The Farm's own animals alone, as its purse is the Farm's own money: a Venture's are on its own line below.
  const read: Read = {
    costs: theFarmsOwn(costs, ownedThenBy),
    money,
    dispatched,
    writtenOff: await writtenOffByItem(db, farm.id),
    overheadMoney,
    everyAnimal: costs.history,
    now,
  };
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
