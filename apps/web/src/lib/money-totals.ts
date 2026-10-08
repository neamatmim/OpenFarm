/** What a period's money comes to, as the farm totals it. */
export interface MoneyTotals {
  inMoney: number;
  outMoney: number;
  awaiting: number;
}

interface ListedMoney {
  events: readonly {
    direction: "in" | "out";
    amountMoney: number;
    approval: string;
  }[];
  totals?: MoneyTotals;
}

/**
 * What a period's money comes to: the farm's own totals, from every entry in the period however many the register
 * shows — or, in an answer kept from before the farm sent them, the rows it did send added up, as screens did then.
 */
export const moneyTotals = (list: ListedMoney): MoneyTotals =>
  list.totals ?? {
    inMoney: list.events
      .filter((row) => row.direction === "in")
      .reduce((sum, row) => sum + row.amountMoney, 0),
    outMoney: list.events
      .filter((row) => row.direction === "out")
      .reduce((sum, row) => sum + row.amountMoney, 0),
    awaiting: list.events.filter((row) => row.approval === "awaiting").length,
  };

/** Whether the totals shown are only the rows' sum: an answer kept from before the farm totaled it, cut short. */
export const totalsPartial = (list: { more: boolean; totals?: MoneyTotals }) =>
  list.totals === undefined && list.more;
