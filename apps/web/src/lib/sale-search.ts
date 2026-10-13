/** The Sales page's own tabs: the Selling Trips are on the Trips page alone. */
export type SaleTab = "ready" | "sold";

export interface SaleSearch {
  tab?: "sold";
  /** The animal another page sent here to sell. */
  sell?: string;
  /** The farm day the sold list shows; none is today. */
  day?: string;
}

/** Whether a "YYYY-MM-DD" is a day the calendar has. */
const aDay = (day: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    return false;
  }
  const date = new Date(`${day}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
  );
};

/** What the Sales page's address keeps: which tab, which animal to sell, and which day's sales are listed. */
export const saleSearchOf = (search: Record<string, unknown>): SaleSearch => ({
  ...(search.tab === "sold" ? { tab: "sold" as const } : {}),
  ...(typeof search.sell === "string" && search.sell !== ""
    ? { sell: search.sell }
    : {}),
  ...(typeof search.day === "string" && aDay(search.day)
    ? { day: search.day }
    : {}),
});

/** An address from before the Selling Trips moved to the Trips page: it goes there rather than to a tab not here. */
export const wasTheTripTab = (search: Record<string, unknown>): boolean =>
  search.tab === "trip";
