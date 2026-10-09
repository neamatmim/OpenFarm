/**
 * The change from the month before to this one, as the Monthly Report's Summary sets it beside the two (ADR 0023): a sum
 * in whole taka, each month rounded as it is said so the three figures add up on the page; a margin in percentage
 * points, to the tenth. Nothing where either month has nothing. The paper and the screen both say it from here.
 */
export const changeBetween = (
  kind: "sum" | "percent",
  now: number | null,
  before: number | null
): number | null => {
  if (now === null || before === null) {
    return null;
  }
  return kind === "sum"
    ? Math.round(now) - Math.round(before)
    : Math.round((now - before) * 10) / 10;
};
