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
export const firstToUse = (a: LotIn, b: LotIn) => {
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

/**
 * When a delivery came into the store, as the store is replayed: its day's start — unless it was written down on that
 * same day, when the moment it was written down. A delivery has only a day, and dated at midnight it sorted before a
 * count made that morning: a lorry at four in the afternoon, written down on its day, was wiped out by the count it
 * came after.
 */
export const cameInAt = (cameInOn: Date, recordedAt: Date): Date =>
  recordedAt > cameInOn && farmDayOf(recordedAt) === farmDayOf(cameInOn)
    ? recordedAt
    : cameInOn;

/** Something that happened to a store of Lots, at the moment it happened. */
export type LotHappening<Lot extends LotIn> =
  | { kind: "in"; at: Date; lot: Lot }
  /** Used: a dose given, feed fed. The id, where it has one, is told which Lot it came out of. */
  | { kind: "out"; at: Date; quantity: number; id?: string }
  | { kind: "counted"; at: Date; counted: number };

/** A store of Lots as it stands once replayed. */
export interface LotsReplayed<Lot extends LotIn> {
  /** Every Lot, in the order the store is used in, empty ones too. */
  lots: LotStanding<Lot>[];
  /** On the shelf from no Lot the farm wrote down: what counts found over the book. */
  found: number;
  onHand: number;
  /** What every count found over the book as it stood just before it — less than nothing where it found less. */
  countedDifference: number;
  /** The Lot each use with an id came out of, the first it reached into; null for one from a Lot nobody wrote down. */
  takenFrom: Map<string, string | null>;
  /** The first Lot with something left and a day printed on it: the one to reach for, and to watch. */
  next: LotStanding<Lot> | null;
  /** How much is still on the shelf from Lots already past their day. */
  pastItsDay: number;
}

/** At one instant, a Lot coming in before what is used, and both before the shelf is counted. */
const HAPPENING_ORDER = { in: 0, out: 1, counted: 2 } as const;

/**
 * A store of Lots — a product's medicine or a Feed Item's feed — replayed in the order things happened: a Lot comes
 * in, what is used comes out of the Lots first to expire among those already in, and a count is what was on the
 * shelf — what it did not find gone from the Lots first to expire (a box past its day, thrown out, is one), what it
 * found over the book kept as found.
 *
 * Replayed rather than worked out from a total: every use ever taken first-to-expire took it from Lots that came in
 * after it, named the wrong Lot as expiring, and hid a later Lot's day from its warning.
 */
export const replayLots = <Lot extends LotIn>(
  happenings: readonly LotHappening<Lot>[],
  window: ExpiryWindow
): LotsReplayed<Lot> => {
  const inOrder = happenings.toSorted(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      HAPPENING_ORDER[a.kind] - HAPPENING_ORDER[b.kind]
  );
  const lots: (Lot & { left: number })[] = [];
  const takenFrom = new Map<string, string | null>();
  let found = 0;
  // Used with nothing on the book to use it from, until a count says what was really there.
  let owed = 0;
  let countedDifference = 0;
  const onTheShelf = () => lots.reduce((sum, one) => sum + one.left, 0) + found;
  /** Takes from the Lots first to expire; what is left over had no Lot to come from. The first Lot reached. */
  const takeFromLots = (quantity: number) => {
    let toTake = quantity;
    let first: string | null = null;
    for (const one of lots.toSorted(firstToUse)) {
      const taken = Math.min(one.left, toTake);
      if (taken > 0) {
        first ??= one.id;
      }
      one.left -= taken;
      toTake -= taken;
    }
    return { short: toTake, first };
  };
  for (const happening of inOrder) {
    if (happening.kind === "in") {
      lots.push({ ...happening.lot, left: happening.lot.quantity });
    } else if (happening.kind === "out") {
      const { short, first } = takeFromLots(happening.quantity);
      const fromFound = Math.min(found, short);
      found -= fromFound;
      owed += short - fromFound;
      if (happening.id) {
        takenFrom.set(happening.id, first);
      }
    } else {
      const book = Math.max(0, onTheShelf() - owed);
      countedDifference += happening.counted - book;
      owed = 0;
      const over = onTheShelf() - happening.counted;
      if (over > 0) {
        const { short } = takeFromLots(over);
        found = Math.max(0, found - short);
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
