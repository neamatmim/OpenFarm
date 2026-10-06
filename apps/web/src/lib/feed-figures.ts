import { MAX_BAG_KG, SMALLEST_FEED_AMOUNT } from "@OpenFarm/domain";

/** An amount of feed the store keeps: a tenth of its unit at least, as the farm reads it — or nothing. */
export const keptAmount = (amount: number): number | null =>
  amount >= SMALLEST_FEED_AMOUNT ? amount : null;

/** Whether a bag's weight as typed is one the farm takes: blank, or above nothing and no more than a bag weighs. */
export const bagSizeTakes = (typed: string): boolean => {
  if (typed.trim() === "") {
    return true;
  }
  const size = Number(typed);
  return size > 0 && size <= MAX_BAG_KG;
};

/** Whether a figure as typed is one the farm takes: blank, for none; a low-stock level of a tenth of the unit at
 *  least; a Fodder Price of nothing or more. */
export const figureTakes = (kind: "level" | "fodderPrice", typed: string) => {
  if (typed.trim() === "") {
    return true;
  }
  const figured = Number(typed);
  return kind === "level"
    ? figured >= SMALLEST_FEED_AMOUNT
    : !Number.isNaN(figured) && figured >= 0;
};
