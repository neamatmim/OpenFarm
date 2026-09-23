import { farmDayOf } from "./farm-clock";

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Where a Lot stands against its Expiry: past it, within the farm's warning, clear of it — or no day printed. */
export type ExpiryStanding = "expired" | "soon" | "fine" | "none";

/** The two farm days a Lot's Expiry is read against: today, and the last day the farm's warning reaches. */
export interface ExpiryWindow {
  today: string;
  warnUntil: string;
}

/** The window as it stands at this moment, for a farm that warns this many days ahead. */
export const expiryWindow = (now: Date, warnDays: number): ExpiryWindow => ({
  today: farmDayOf(now),
  warnUntil: farmDayOf(new Date(now.getTime() + warnDays * ONE_DAY_MS)),
});

/**
 * Where a Lot stands against the day it may be used until, on the farm's own calendar.
 *
 * Expired is the day after its last: a box that says 31 August may still be used on 31 August. The days are
 * YYYY-MM-DD, which sort as text.
 */
export const expiryStanding = (
  expiresOn: string | null,
  window: ExpiryWindow
): ExpiryStanding => {
  if (!expiresOn) {
    return "none";
  }
  if (expiresOn < window.today) {
    return "expired";
  }
  return expiresOn <= window.warnUntil ? "soon" : "fine";
};

/** One Lot of a store as it stands: what came in, what is left of it, and where it stands against its Expiry. */
export type LotStanding<Lot extends LotIn> = Lot & {
  left: number;
  standing: ExpiryStanding;
};

/** A store of Lots — a product's medicine or a Feed Item's feed — as the lists and the notices read it. */
export interface StoreOfLots<Lot extends LotIn> {
  /** Every Lot, in the order the store is used in, empty ones too. */
  lots: LotStanding<Lot>[];
  /** The first Lot with something left and a day printed on it: the one to reach for, and to watch. */
  next: LotStanding<Lot> | null;
  /** How much is still on the shelf from Lots already past their day. */
  pastItsDay: number;
}

/**
 * A store of Lots, given how much of it was used and the window its days are read against.
 *
 * What was used is the one thing medicine and feed answer differently — doses given, never more than came in; feed
 * fed or found short at a Stock Count — so each says it, and everything read from the Lots after that is the same
 * rule for both: first to expire first used, and each Lot's standing on the farm's day with the farm's warning.
 */
export const storeOfLots = <Lot extends LotIn>(
  lots: readonly Lot[],
  used: number,
  window: ExpiryWindow
): StoreOfLots<Lot> => {
  const byId = new Map(lots.map((one) => [one.id, one] as const));
  const standing = leftOfEachLot(lots, used).flatMap(({ id, left }) => {
    const one = byId.get(id);
    return one
      ? [{ ...one, left, standing: expiryStanding(one.expiresOn, window) }]
      : [];
  });
  return {
    lots: standing,
    next:
      standing.find((one) => one.left > 0 && one.expiresOn !== null) ?? null,
    pastItsDay: standing
      .filter((one) => one.standing === "expired")
      .reduce((sum, one) => sum + one.left, 0),
  };
};

/** Is a store under the level the farm asked to hear about? Never for one nobody watches, or one retired. */
export const runsLow = ({
  onHand,
  level,
  retired,
}: {
  onHand: number;
  level: number | null;
  retired: boolean;
}): boolean => level !== null && !retired && onHand < level;
