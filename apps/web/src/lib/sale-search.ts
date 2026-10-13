import { farmDayOf, isAFarmDay } from "@OpenFarm/domain";

/** The Sales page's own tabs: the Selling Trips are on the Trips page alone. */
export type SaleTab = "ready" | "sold";

export interface SaleSearch {
  tab?: "sold";
  /** The animal another page sent here to sell. */
  sell?: string;
  /** The farm day the sold list shows; none is today. */
  day?: string;
}

/** What the Sales page's address keeps: which tab, which animal to sell, and which day's sales are listed — a day the
 *  calendar has and that has come, so one typed for tomorrow reads as today. */
export const saleSearchOf = (
  search: Record<string, unknown>,
  today: string = farmDayOf(new Date())
): SaleSearch => ({
  ...(search.tab === "sold" ? { tab: "sold" as const } : {}),
  ...(typeof search.sell === "string" && search.sell !== ""
    ? { sell: search.sell }
    : {}),
  ...(typeof search.day === "string" &&
  isAFarmDay(search.day, { notAfter: today })
    ? { day: search.day }
    : {}),
});

/** An address from before the Selling Trips moved to the Trips page: it goes there rather than to a tab not here. */
export const wasTheTripTab = (search: Record<string, unknown>): boolean =>
  search.tab === "trip";
