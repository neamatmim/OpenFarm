/** One Lot as it came into the store: how much, the last day it may be used, and the day it came. */
export interface LotIn {
  id: string;
  quantity: number;
  /** The farm's own day, YYYY-MM-DD, or null where none is printed. */
  expiresOn: string | null;
  /** When it came in; anything that sorts by time — a farm day or an ISO instant. */
  cameInOn: string;
}

/**
 * The order the store is used in: the Lot that expires first, then the one that came in first. A Lot with no day
 * printed on it is reached for after every Lot that has one, because it is the one that will not go off.
 */
const firstToUse = (a: LotIn, b: LotIn) => {
  if (a.expiresOn !== b.expiresOn) {
    if (a.expiresOn === null) {
      return 1;
    }
    if (b.expiresOn === null) {
      return -1;
    }
    return a.expiresOn.localeCompare(b.expiresOn);
  }
  return a.cameInOn.localeCompare(b.cameInOn) || a.id.localeCompare(b.id);
};

/**
 * What is left of each Lot once `used` has been taken from the store, in the order it is used in.
 *
 * Worked out, never counted: the farm records what came in and what was given or fed, not which box each dose came
 * out of, so the store is read as a careful storeman keeps it — first to expire, first used. More used than ever came
 * in (a purchase nobody wrote down) leaves nothing, not less than nothing.
 */
export const leftOfEachLot = (
  lots: readonly LotIn[],
  used: number
): { id: string; left: number }[] => {
  let toTake = Math.max(0, used);
  return lots.toSorted(firstToUse).map((one) => {
    const taken = Math.min(one.quantity, toTake);
    toTake -= taken;
    return { id: one.id, left: one.quantity - taken };
  });
};
