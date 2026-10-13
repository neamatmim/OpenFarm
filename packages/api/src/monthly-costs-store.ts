import type { Database } from "@OpenFarm/db";
import {
  farmDayOf,
  monthOf,
  monthlyCostsNotEntered,
  monthsEndingIn,
  roundMoney,
  startOfFarmDay,
} from "@OpenFarm/domain";

import { THE_FARMS_PURSE } from "./money-store";

type Db = Pick<Database, "query">;

/** Each Category's last money entered by hand in the Farm's purse: who it went to and how much. */
const lastEnteredUnder = async (
  db: Db,
  farmId: string,
  categoryIds: readonly string[]
): Promise<
  Map<string, { counterparty: string | null; amountMoney: number }>
> => {
  if (categoryIds.length === 0) {
    return new Map();
  }
  const entered = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      purseVentureId: THE_FARMS_PURSE,
      source: "by_hand",
      categoryId: { in: [...categoryIds] },
    },
    columns: { categoryId: true, amountMoney: true },
    with: { counterparty: { columns: { name: true } } },
    orderBy: { occurredAt: "desc", recordedAt: "desc", id: "desc" },
  });
  const last = new Map<
    string,
    { counterparty: string | null; amountMoney: number }
  >();
  for (const one of entered) {
    if (!last.has(one.categoryId)) {
      last.set(one.categoryId, {
        counterparty: one.counterparty?.name ?? null,
        amountMoney: one.amountMoney,
      });
    }
  }
  return last;
};

/** Each person's last wage, whole: what it paid and what it took off their draws. */
const lastWageOf = async (
  db: Db,
  farmId: string,
  personIds: readonly string[]
): Promise<Map<string, number>> => {
  if (personIds.length === 0) {
    return new Map();
  }
  const wages = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      wageMonth: { isNotNull: true },
      counterpartyId: { in: [...personIds] },
    },
    columns: { id: true, counterpartyId: true, amountMoney: true },
    orderBy: { wageMonth: "desc", id: "desc" },
  });
  const latest = new Map<string, { id: string; amountMoney: number }>();
  for (const one of wages) {
    if (one.counterpartyId && !latest.has(one.counterpartyId)) {
      latest.set(one.counterpartyId, one);
    }
  }
  const taken = await db.query.wageDrawTaken.findMany({
    where: {
      wageEventId: { in: [...latest.values()].map((one) => one.id) },
    },
    columns: { wageEventId: true, amount: true },
  });
  const takenBy = new Map<string, number>();
  for (const one of taken) {
    takenBy.set(
      one.wageEventId,
      (takenBy.get(one.wageEventId) ?? 0) + one.amount
    );
  }
  const last = new Map<string, number>();
  for (const [personId, wage] of latest) {
    last.set(
      personId,
      roundMoney(wage.amountMoney + (takenBy.get(wage.id) ?? 0))
    );
  }
  return last;
};

/**
 * What of the farm's month has not been entered yet, for the Manager's home and the Owner's (CONTEXT.md: **Monthly
 * Cost**): each Monthly Cost with nothing under it, and each person paid a wage one month and not the next — worded
 * for the row, with what the money entry needs to be opened already filled.
 *
 * The Farm's purse alone. A Venture's entry under a Category the farm pays every month would otherwise stand in for
 * the Farm's; a wage is the Farm's whatever else is true, and the purse is asked of it all the same.
 */
export const monthlyCostsNow = async (
  db: Db,
  farm: { id: string; monthlyCostsFromDay: number },
  now: Date
) => {
  const today = farmDayOf(now);
  // A Monthly Cost is asked about for last month and this one; a wage for as far back as the month before the one
  // looked for, which is three months before this.
  const [wagesFrom = "", , lastMonth = ""] = monthsEndingIn(today, 4);
  const categories = await db.query.moneyCategory.findMany({
    where: { farmId: farm.id, paidMonthlySince: { isNotNull: true } },
    columns: {
      id: true,
      nameBn: true,
      nameEn: true,
      paidMonthlySince: true,
      retiredAt: true,
    },
  });
  const [entered, wages, wagesCategory] = await Promise.all([
    categories.length === 0
      ? []
      : db.query.moneyEvent.findMany({
          where: {
            farmId: farm.id,
            purseVentureId: THE_FARMS_PURSE,
            categoryId: { in: categories.map((one) => one.id) },
            occurredAt: {
              gte: startOfFarmDay(`${lastMonth}-01`),
              lt: monthOf(now).until,
            },
          },
          columns: { categoryId: true, occurredAt: true },
        }),
    db.query.moneyEvent.findMany({
      where: {
        farmId: farm.id,
        purseVentureId: THE_FARMS_PURSE,
        wageMonth: { gte: wagesFrom },
        counterpartyId: { isNotNull: true },
      },
      columns: { counterpartyId: true, wageMonth: true },
      with: { counterparty: { columns: { name: true } } },
    }),
    db.query.moneyCategory.findFirst({
      where: { farmId: farm.id, key: "wages" },
      columns: { id: true },
    }),
  ]);

  const owed = monthlyCostsNotEntered({
    today,
    fromDay: farm.monthlyCostsFromDay,
    categories: categories.flatMap((one) =>
      one.paidMonthlySince
        ? [
            {
              id: one.id,
              paidMonthlySince: one.paidMonthlySince,
              retired: one.retiredAt !== null,
            },
          ]
        : []
    ),
    entered,
    wages: wages.flatMap((one) =>
      one.counterpartyId && one.wageMonth && one.counterparty
        ? [
            {
              personId: one.counterpartyId,
              name: one.counterparty.name,
              month: one.wageMonth,
            },
          ]
        : []
    ),
  });
  const byId = new Map(categories.map((one) => [one.id, one]));
  const [lastEntries, lastWages] = await Promise.all([
    lastEnteredUnder(
      db,
      farm.id,
      owed.costs.map((one) => one.categoryId)
    ),
    lastWageOf(
      db,
      farm.id,
      owed.wages.map((one) => one.personId)
    ),
  ]);
  return {
    costs: owed.costs.flatMap((one) => {
      const category = byId.get(one.categoryId);
      return category
        ? [
            {
              categoryId: one.categoryId,
              categoryBn: category.nameBn,
              categoryEn: category.nameEn,
              month: one.month,
              /** What was entered under it last, so the entry opens with who was paid and how much. */
              last: lastEntries.get(one.categoryId) ?? null,
            },
          ]
        : [];
    }),
    wages: owed.wages.map((one) => ({
      /** The person's own record, which is what tells two rows apart. */
      personId: one.personId,
      personName: one.name,
      month: one.month,
      /** Where the wage is entered, so the row opens the money entry on it. */
      categoryId: wagesCategory?.id ?? null,
      /** Their last wage whole — what was paid and the draws it took — so the entry opens with it. */
      lastWageMoney: lastWages.get(one.personId) ?? null,
    })),
  };
};
