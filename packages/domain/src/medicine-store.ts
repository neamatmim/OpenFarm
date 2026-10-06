import type { ExpiryWindow, LotIn, LotStanding } from "./lots";
import { expiryStanding, firstToUse } from "./lots";

/** One Lot of medicine as it came in: a Medicine Purchase, and what its box says. */
export type MedicineLotIn = LotIn & { lotNumber: string | null };

/** Something that happened to a product's medicine, at the moment it happened. */
export type MedicineHappening =
  | { kind: "bought"; at: Date; lot: MedicineLotIn }
  | { kind: "given"; at: Date; doseId: string }
  | { kind: "counted"; at: Date; counted: number };

/** A product's medicine as the store holds it now. */
export interface MedicineStore {
  /** Every Lot, in the order the store is used in, empty ones too. */
  lots: LotStanding<MedicineLotIn>[];
  /** Doses on the shelf from no Lot the farm wrote down: what counts found over the book. */
  found: number;
  onHand: number;
  /** What every count found over the book as it stood just before it — less than nothing where they found fewer. */
  countedDifference: number;
  /** The Lot each dose came out of, by its id; null for a dose given from a box nobody wrote down. */
  takenFrom: Map<string, string | null>;
  /** The first Lot with doses left and a day printed on it: the one to reach for, and to watch. */
  next: LotStanding<MedicineLotIn> | null;
  /** Doses still on the shelf from Lots already past their day. */
  pastItsDay: number;
}

/** At one instant, a Lot coming in before a dose going out, and both before the shelf is counted. */
const ORDER = { bought: 0, given: 1, counted: 2 } as const;

/**
 * A product's medicine, replayed in the order things happened: a Medicine Purchase brings its Lot in, a dose comes
 * out of the Lot first to expire among those already bought, and a count is what was on the shelf — doses it did not
 * find gone from the Lots first to expire (a box past its day, thrown out, is one), doses it found over the book kept
 * as found.
 *
 * Replayed rather than summed: the count once stored what the book said that day and the farm added up the
 * differences, so a dose given before a count but written down after it came off the shelf twice, an earlier count
 * put right undid what a later one found, doses found over the book never showed, and a dose was taken from a Lot
 * bought after it was given. The count wins, and what is written about the days before it cannot move it.
 */
export const medicineStoreOf = (
  happenings: readonly MedicineHappening[],
  window: ExpiryWindow
): MedicineStore => {
  const inOrder = happenings.toSorted(
    (a, b) => a.at.getTime() - b.at.getTime() || ORDER[a.kind] - ORDER[b.kind]
  );
  const lots: (MedicineLotIn & { left: number })[] = [];
  const takenFrom = new Map<string, string | null>();
  let found = 0;
  // Doses given with nothing on the book to give them from, until a count says what was really there.
  let owed = 0;
  let countedDifference = 0;
  const onTheShelf = () => lots.reduce((sum, one) => sum + one.left, 0) + found;
  const takeFromLots = (doses: number) => {
    let toTake = doses;
    for (const one of lots.toSorted(firstToUse)) {
      const taken = Math.min(one.left, toTake);
      one.left -= taken;
      toTake -= taken;
    }
    return toTake;
  };
  for (const happening of inOrder) {
    if (happening.kind === "bought") {
      lots.push({ ...happening.lot, left: happening.lot.quantity });
    } else if (happening.kind === "given") {
      const lot = lots.toSorted(firstToUse).find((one) => one.left > 0);
      if (lot) {
        lot.left -= 1;
      } else if (found > 0) {
        found -= 1;
      } else {
        owed += 1;
      }
      takenFrom.set(happening.doseId, lot?.id ?? null);
    } else {
      const book = Math.max(0, onTheShelf() - owed);
      countedDifference += happening.counted - book;
      owed = 0;
      const over = onTheShelf() - happening.counted;
      if (over > 0) {
        found = Math.max(0, found - takeFromLots(over));
      } else {
        found -= over;
      }
    }
  }
  const standing = lots.toSorted(firstToUse).map((one) => ({
    ...one,
    standing: expiryStanding(one.expiresOn, window),
  }));
  return {
    lots: standing,
    found,
    onHand: Math.max(0, onTheShelf() - owed),
    countedDifference,
    takenFrom,
    next:
      standing.find((one) => one.left > 0 && one.expiresOn !== null) ?? null,
    pastItsDay: standing
      .filter((one) => one.standing === "expired")
      .reduce((sum, one) => sum + one.left, 0),
  };
};
