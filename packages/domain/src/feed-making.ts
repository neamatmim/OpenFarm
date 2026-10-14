/**
 * Feed made on the farm (CONTEXT.md **Feed Making**, ADR 0031): a home-mixed concentrate, or silage packed into a pit
 * or bags. Its inputs leave the store the moment it was made; its made feed comes into the store when it came out —
 * at once for a mix, the day the pit was opened for silage — worth what went into it, each input at the store's price
 * the moment it was taken out. Worked out every time the store is read, never typed or kept: a Purchase put right, or
 * a Fodder Price set at last on the cut that went in, prices what was made from it without anybody remembering to.
 */
import type { StockMovement, StoreState } from "./feed";
import { emptyStore, inStoreOrder, roundKg, stepStore } from "./feed";
import { roundMoney } from "./money";

/** A Feed Making as the store reads it. */
export interface MakingRead {
  id: string;
  /** When its inputs left the store. */
  madeAt: Date;
  outputFeedItemId: string;
  /** What it took out of the store, each in its own feed's unit. */
  inputs: readonly { feedItemId: string; quantity: number }[];
  /** Its made feed, once it came into the store: the Feed In it came as, when, and how much. Nothing while it is still
   *  in the pit. */
  madeFeed: { arrivalId: string; at: Date; quantity: number } | null;
}

/** What a Feed Making was worth: what its inputs were worth the moment they were taken out. */
export interface MakingWorth {
  id: string;
  madeAt: Date;
  /** When its made feed came into the store; nothing while it is in the pit. */
  cameInAt: Date | null;
  /** In taka; nothing while any input had no price then. */
  worthMoney: number | null;
  /** What a unit of each input was taken out at: the store's price that moment, nothing where it had none. */
  inputs: { feedItemId: string; unitPriceMoney: number | null }[];
}

/** Made feed, as a Feed In: what only a Feed Making brings into the store, and only it puts right. */
export const isMadeFeed = (arrival: { kind: string }): boolean =>
  arrival.kind === "made";

/** What a unit of made feed came to: what went in over what came out; nothing while what went in has no price. */
export const madeUnitPriceOf = (
  worthMoney: number | null,
  quantity: number
): number | null =>
  worthMoney !== null && quantity > 0 ? worthMoney / quantity : null;

/** One Feed Item's store being read forward a moment at a time, once over: its movements in order, how far it has
 *  been read, and the store as it stood there. */
interface Cursor {
  /** Its movements as they were read from the farm, in order; `next` is the first not yet read. */
  list: StockMovement[];
  next: number;
  /** What the Makings added that has not been read yet, in order: few, so kept apart and merged as it is read. */
  added: StockMovement[];
  /** Everything read so far, in the order it was read. */
  read: StockMovement[];
  state: StoreState;
}

/** The next movement a cursor would read — its own or one a Making added, whichever came first — and where from. */
const upNext = (
  cursor: Cursor
): { one: StockMovement; added: boolean } | null => {
  const own = cursor.list[cursor.next];
  const [added] = cursor.added;
  if (own && added) {
    return inStoreOrder(added, own) < 0
      ? { one: added, added: true }
      : { one: own, added: false };
  }
  if (own) {
    return { one: own, added: false };
  }
  return added ? { one: added, added: true } : null;
};

/** Reads a cursor's next movement into its store. */
const readNext = (cursor: Cursor, next: { added: boolean }) => {
  const one = next.added ? cursor.added.shift() : cursor.list[cursor.next];
  if (!next.added) {
    cursor.next += 1;
  }
  if (one) {
    stepStore(cursor.state, one);
    cursor.read.push(one);
  }
};

/**
 * Takes each Making into the store (`store`, every movement by Feed Item, which this adds to): its inputs out at the
 * moment it was made, its made feed in at the moment it came out — never before it was made, though a pit opened and
 * written up later is dated by its day — at what its inputs were worth, each at the store's price that moment. Read in
 * the order they were made, so a Making from feed another Making made reads that feed at its own made price. Any input
 * with no price then leaves the made feed unpriced, as a Harvest with no Fodder Price is, rather than priced on what
 * had one: what it is worth is not what part of it cost.
 *
 * Each Feed Item's store is read forward once, however many Makings take from it: a daily mix over three years asks a
 * thousand prices of the bran, and reading its whole history again for each was most of every read of the store.
 */
export const bringMakingsIn = (
  store: Map<string, StockMovement[]>,
  makings: readonly MakingRead[]
): Map<string, MakingWorth> => {
  const cursors = new Map<string, Cursor>();
  const cursorOf = (feedItemId: string): Cursor => {
    let cursor = cursors.get(feedItemId);
    if (!cursor) {
      cursor = {
        list: (store.get(feedItemId) ?? []).toSorted(inStoreOrder),
        next: 0,
        added: [],
        read: [],
        state: emptyStore(),
      };
      cursors.set(feedItemId, cursor);
    }
    return cursor;
  };
  /** The store's price the moment `at`: everything before it read, and what came in at it — what goes out or is
   *  counted at the same moment never moves the price. */
  const priceAt = (feedItemId: string, at: Date): number | null => {
    const cursor = cursorOf(feedItemId);
    const moment = at.getTime();
    let next = upNext(cursor);
    while (
      next &&
      (next.one.at.getTime() < moment ||
        (next.one.at.getTime() === moment && next.one.kind === "in"))
    ) {
      readNext(cursor, next);
      next = upNext(cursor);
    }
    return cursor.state.price;
  };
  /** A movement a Making adds, put in its place among those not yet read. */
  const add = (feedItemId: string, movement: StockMovement) => {
    const { added } = cursorOf(feedItemId);
    let at = added.length;
    while (
      at > 0 &&
      inStoreOrder(added[at - 1] as StockMovement, movement) > 0
    ) {
      at -= 1;
    }
    added.splice(at, 0, movement);
  };
  const worths = new Map<string, MakingWorth>();
  const inOrder = makings.toSorted(
    (a, b) =>
      a.madeAt.getTime() - b.madeAt.getTime() || a.id.localeCompare(b.id)
  );
  for (const making of inOrder) {
    let worth: number | null = 0;
    const prices: MakingWorth["inputs"] = [];
    for (const input of making.inputs) {
      const price = priceAt(input.feedItemId, making.madeAt);
      prices.push({
        feedItemId: input.feedItemId,
        unitPriceMoney: price === null ? null : roundMoney(price),
      });
      worth =
        worth === null || price === null
          ? null
          : worth + price * input.quantity;
    }
    for (const input of making.inputs) {
      add(input.feedItemId, {
        kind: "out",
        at: making.madeAt,
        quantity: input.quantity,
        into: making.id,
      });
    }
    const worthMoney = worth === null ? null : roundMoney(worth);
    const cameInAt = making.madeFeed
      ? new Date(
          Math.max(making.madeFeed.at.getTime(), making.madeAt.getTime())
        )
      : null;
    if (making.madeFeed && cameInAt) {
      add(making.outputFeedItemId, {
        kind: "in",
        at: cameInAt,
        quantity: making.madeFeed.quantity,
        priceMoney: worthMoney,
        lot: {
          id: making.madeFeed.arrivalId,
          lotNumber: null,
          expiresOn: null,
        },
      });
    }
    worths.set(making.id, {
      id: making.id,
      madeAt: making.madeAt,
      cameInAt,
      worthMoney,
      inputs: prices,
    });
  }
  for (const [feedItemId, cursor] of cursors) {
    // Every reader of the store puts its movements in order itself.
    store.set(feedItemId, [
      ...cursor.read,
      ...cursor.list.slice(cursor.next),
      ...cursor.added,
    ]);
  }
  return worths;
};

/**
 * What lay in the pit at a moment: every Making made by then whose made feed had not yet come out, at what went into
 * it — the farm's feed still, only not yet to be fed — and how many of them nothing can price.
 */
export const inThePitAt = (
  worths: ReadonlyMap<
    string,
    Pick<MakingWorth, "madeAt" | "cameInAt" | "worthMoney">
  >,
  at: Date
): { worthMoney: number; unpriced: number } => {
  let worth = 0;
  let unpriced = 0;
  for (const one of worths.values()) {
    const packed =
      one.madeAt <= at && (one.cameInAt === null || one.cameInAt > at);
    if (!packed) {
      continue;
    }
    if (one.worthMoney === null) {
      unpriced += 1;
    } else {
      worth += one.worthMoney;
    }
  }
  return { worthMoney: roundMoney(worth), unpriced };
};

/**
 * What a Making lost between what went in and what came out — the silage pit's loss, or a mix's dust — and as a share
 * of what went in. Said only where every input is counted in the made feed's own unit: kilos of maize and liters of
 * molasses do not add up to kilos of silage.
 */
export const makingLossOf = ({
  inputs,
  output,
}: {
  inputs: readonly { quantity: number; unit: string }[];
  output: { quantity: number; unit: string };
}): { lost: number; percent: number } | null => {
  if (inputs.length === 0 || inputs.some((one) => one.unit !== output.unit)) {
    return null;
  }
  const went = inputs.reduce((sum, one) => sum + one.quantity, 0);
  if (went <= 0) {
    return null;
  }
  const lost = roundKg(went - output.quantity);
  return { lost, percent: Math.round((lost / went) * 1000) / 10 };
};
