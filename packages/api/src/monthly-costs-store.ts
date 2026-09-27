import type { Database } from "@OpenFarm/db";
import {
  farmDayOf,
  monthOf,
  monthlyCostsNotEntered,
  startOfFarmDay,
} from "@OpenFarm/domain";

import { THE_FARMS_PURSE } from "./money-store";

type Db = Pick<Database, "query">;

/** The first day of the month `count` months before the one `day` falls in, on the farm's own clock. */
const monthsBefore = (day: string, count: number): Date => {
  const index =
    Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 - count;
  const month = String((index % 12) + 1).padStart(2, "0");
  return startOfFarmDay(`${Math.floor(index / 12)}-${month}-01`);
};

/**
 * What of the farm's month has not been entered yet, for the Manager's home and the Owner's (CONTEXT.md: **Monthly
 * Cost**): each Monthly Cost with nothing under it, and each person paid a wage one month and not the next — worded
 * for the row, with what the money entry needs to be opened already filled.
 *
 * The Farm's purse alone. A Venture's money is never rent or a wage, and a Venture's entry under a Category the farm
 * pays every month would otherwise stand in for the Farm's.
 */
export const monthlyCostsNow = async (
  db: Db,
  farm: { id: string; monthlyCostsDueDay: number },
  now: Date
) => {
  const today = farmDayOf(now);
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
  // Last month and this one are all a Monthly Cost is asked about; wages reach back one more, to the month before
  // the one looked for.
  const entered =
    categories.length === 0
      ? []
      : await db.query.moneyEvent.findMany({
          where: {
            farmId: farm.id,
            purseVentureId: THE_FARMS_PURSE,
            categoryId: { in: categories.map((one) => one.id) },
            occurredAt: {
              gte: monthsBefore(today, 1),
              lt: monthOf(now).until,
            },
          },
          columns: { categoryId: true, occurredAt: true },
        });
  const wages = await db.query.moneyEvent.findMany({
    where: {
      farmId: farm.id,
      wageMonth: { gte: farmDayOf(monthsBefore(today, 3)).slice(0, 7) },
      counterpartyId: { isNotNull: true },
    },
    columns: { counterpartyId: true, wageMonth: true },
    with: { counterparty: { columns: { name: true } } },
  });

  const owed = monthlyCostsNotEntered({
    today,
    dueDay: farm.monthlyCostsDueDay,
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
  const wagesCategory = await db.query.moneyCategory.findFirst({
    where: { farmId: farm.id, key: "wages" },
    columns: { id: true },
  });
  const byId = new Map(categories.map((one) => [one.id, one]));
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
            },
          ]
        : [];
    }),
    wages: owed.wages.map((one) => ({
      personName: one.name,
      month: one.month,
      /** Where the wage is entered, so the row opens the money entry on it. */
      categoryId: wagesCategory?.id ?? null,
    })),
  };
};
