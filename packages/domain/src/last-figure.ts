/**
 * What an animal gave or weighed the time before, beside the box on the sheet, and when a figure typed now is too far
 * from it to take without asking. A fixed range lets 55 litres through for 5.5, and 1,200 kg for 120: the figure the
 * person typed last time for this cow is the one a slip of the thumb is far from.
 */

/** The Effects whose figure is read against the animal's last. */
export type LastFigureKind = "milk_record" | "weigh_in";

/** How far from her last a figure may be before the person is asked: a share of it, and never less than a floor —
 *  a cow at two litres may give five, and a bull weighed a month on has put on twenty kilos. */
const HOW_FAR = {
  milk_record: { share: 0.5, floor: 3 },
  weigh_in: { share: 0.1, floor: 20 },
} as const satisfies Record<LastFigureKind, { share: number; floor: number }>;

/** Whether an Effect's figure is read against the animal's last. */
export const readsAgainstLast = (kind?: string): kind is LastFigureKind =>
  kind === "milk_record" || kind === "weigh_in";

/** Whether a figure typed now is too far from her last to take without asking. */
export const farFromLast = (
  kind: LastFigureKind,
  last: number,
  typed: number
): boolean => {
  const { share, floor } = HOW_FAR[kind];
  return Math.abs(typed - last) > Math.max(floor, last * share);
};
