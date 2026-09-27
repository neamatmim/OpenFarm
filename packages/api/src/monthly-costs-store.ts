import type { Database } from "@OpenFarm/db";
import {
  farmDayOf,
  monthOf,
  monthlyCostsNotEntered,
  monthsEndingIn,
  startOfFarmDay,
} from "@OpenFarm/domain";

import { THE_FARMS_PURSE } from "./money-store";

type Db = Pick<Database, "query">;

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
      /** The person's own record, which is what tells two rows apart. */
      personId: one.personId,
      personName: one.name,
      month: one.month,
      /** Where the wage is entered, so the row opens the money entry on it. */
      categoryId: wagesCategory?.id ?? null,
    })),
  };
};
