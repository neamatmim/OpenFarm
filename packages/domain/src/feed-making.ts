/**
 * Feed made on the farm (CONTEXT.md **Feed Making**, ADR 0030): a home-mixed concentrate, or silage packed into a pit
 * or bags. Its inputs leave the store the moment it was made; its made feed comes into the store when it came out —
 * at once for a mix, the day the pit was opened for silage — worth what went into it, each input at the store's price
 * the moment it was taken out. Worked out every time the store is read, never typed or kept: a Purchase put right, or
 * a Fodder Price set at last on the cut that went in, prices what was made from it without anybody remembering to.
 */
import type { StockMovement } from "./feed";
import { priceHistory, roundKg } from "./feed";
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

/**
 * Takes each Making into the store (`store`, every movement by Feed Item, which this adds to): its inputs out at the
 * moment it was made, its made feed in at the moment it came out, at what its inputs were worth — each at the store's
 * price that moment. Read in the order they were made, so a Making from feed another Making made reads that feed at
 * its own made price. Any input with no price then leaves the made feed unpriced, as a Harvest with no Fodder Price
 * is, rather than priced on what had one: what it is worth is not what part of it cost.
 */
export const bringMakingsIn = (
  store: Map<string, StockMovement[]>,
  makings: readonly MakingRead[]
): Map<string, MakingWorth> => {
  const add = (feedItemId: string, movement: StockMovement) => {
    const list = store.get(feedItemId) ?? [];
    list.push(movement);
    store.set(feedItemId, list);
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
      const price = priceHistory(store.get(input.feedItemId) ?? [])(
        making.madeAt
      );
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
    if (making.madeFeed) {
      add(making.outputFeedItemId, {
        kind: "in",
        at: making.madeFeed.at,
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
      cameInAt: making.madeFeed?.at ?? null,
      worthMoney,
      inputs: prices,
    });
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
