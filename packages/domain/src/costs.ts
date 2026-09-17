import { roundKg } from "./feed";
import { groupedBy } from "./grouped-by";
import type { Side } from "./lifecycle";
import { roundTaka } from "./money";
import type { PenHistoryLine } from "./pen-history";
import { covers } from "./pen-history";

/** One Feeding, as its cost is worked out: the Pen, when, and what was given of each Feed Item. */
export interface FeedingToCost {
  penId: string;
  fedAt: Date;
  lines: readonly { feedItemId: string; givenKg: number }[];
}

/** One Animal's share of one Feeding: what it cost, and how much of it was feed the farm never paid for. */
export interface FeedShare {
  animalId: string;
  side: Side;
  at: Date;
  feedBdt: number;
  /** Home-grown fodder at no price costs nothing — and the farm is told how much of it there was. */
  unpricedKg: number;
}

/**
 * One Animal's share of something charged to her by the head rather than by what she ate: the Hasil the
 * haat took on her, a Buying or Selling Trip she was on, a month's Herd Costs. One shape for the three,
 * because each is only ever an animal, a moment and an amount.
 */
export interface CostShare {
  animalId: string;
  side: Side;
  at: Date;
  bdt: number;
}

/** A Feeding nobody can be found standing for: charged to nobody, and said. */
export interface UnallocatedFeeding {
  at: Date;
  feedBdt: number;
  unpricedKg: number;
}

/**
 * What the Pens were fed, charged to the animals that ate it (the feed decision, 2026-09-10): each Feed
 * Item's weighted-average price at the time, times what was given, split evenly across the animals
 * standing in the Pen when it was fed. Session by session, that is the split by animal-days.
 *
 * A Feeding nobody can be found standing for — a Pen fed after its last animal left, as the records have
 * it — is not charged to anybody, and is said as unallocated rather than quietly spread elsewhere.
 */
export const feedShares = ({
  feedings,
  history,
  priceOf,
}: {
  feedings: readonly FeedingToCost[];
  history: readonly PenHistoryLine[];
  priceOf: (feedItemId: string, at: Date) => number | null;
}): { shares: FeedShare[]; unallocated: UnallocatedFeeding[] } => {
  const byPen = groupedBy(history, (line) => line.penId);
  const shares: FeedShare[] = [];
  const unallocated: UnallocatedFeeding[] = [];
  for (const fed of feedings) {
    let feedBdt = 0;
    let unpricedKg = 0;
    for (const line of fed.lines) {
      const price = priceOf(line.feedItemId, fed.fedAt);
      if (price === null) {
        unpricedKg += line.givenKg;
      } else {
        feedBdt += price * line.givenKg;
      }
    }
    const standing = (byPen.get(fed.penId) ?? []).filter((line) =>
      covers(line, fed.fedAt)
    );
    if (standing.length === 0) {
      unallocated.push({ at: fed.fedAt, feedBdt, unpricedKg });
      continue;
    }
    for (const line of standing) {
      shares.push({
        animalId: line.animalId,
        side: line.side,
        at: fed.fedAt,
        feedBdt: feedBdt / standing.length,
        unpricedKg: unpricedKg / standing.length,
      });
    }
  }
  return { shares, unallocated };
};

/** How many of a product's latest purchases a dose is costed over: recent enough to follow the price, and
 *  more than one so that a single odd lot does not set it. */
export const PURCHASES_A_DOSE_IS_COSTED_OVER = 3;

/**
 * What one dose of a product cost: its most recent purchases on or before the dose, what they cost
 * together divided by the doses they held (the Owner's decision, 2026-09-13). Null for a product the farm
 * had not bought by then: a dose nobody paid for as far as the records know is uncosted, never free.
 */
export const dosePriceOf = (
  purchases: readonly {
    id: string;
    purchasedOn: Date;
    priceBdt: number;
    doses: number;
  }[],
  givenAt: Date
): number | null => {
  const recent = purchases
    .filter((one) => one.purchasedOn <= givenAt)
    .toSorted(
      (a, b) =>
        b.purchasedOn.getTime() - a.purchasedOn.getTime() ||
        b.id.localeCompare(a.id)
    )
    .slice(0, PURCHASES_A_DOSE_IS_COSTED_OVER);
  const doses = recent.reduce((sum, one) => sum + one.doses, 0);
  if (doses === 0) {
    return null;
  }
  return recent.reduce((sum, one) => sum + one.priceBdt, 0) / doses;
};

/** What an Animal has cost, added up from her shares. */
export interface Costs {
  feedBdt: number;
  unpricedKg: number;
  medicineBdt: number;
  /** Doses of products the farm had not bought by then, shown rather than counted as free. */
  uncostedDoses: number;
  /** Her share of the Vet Fees for visits that named her. */
  vetBdt: number;
  /** The Hasil the haat took on her, charged to her alone. */
  hasilBdt: number;
  /** Her share of the Buying Trip that brought her and the Selling Trips that took her. */
  tripBdt: number;
  /** Her share of the Herd Costs of the Side she stood on, by the days she stood there. */
  herdBdt: number;
}

const spentOn = (costs: Costs): number =>
  costs.feedBdt +
  costs.medicineBdt +
  costs.vetBdt +
  costs.hasilBdt +
  costs.tripBdt +
  costs.herdBdt;

/** Costs as the farm reads them: to the poisha and to the kilo. */
export const roundedCosts = (costs: Costs): Costs => ({
  feedBdt: roundTaka(costs.feedBdt),
  unpricedKg: roundKg(costs.unpricedKg),
  medicineBdt: roundTaka(costs.medicineBdt),
  uncostedDoses: costs.uncostedDoses,
  vetBdt: roundTaka(costs.vetBdt),
  hasilBdt: roundTaka(costs.hasilBdt),
  tripBdt: roundTaka(costs.tripBdt),
  herdBdt: roundTaka(costs.herdBdt),
});

/**
 * A fattening Animal's Margin: her sale price less her purchase price and everything she cost — her feed,
 * her doses, the Vet's visits that named her, the Hasil paid on her, the Trips that moved her and her
 * share of the Herd Costs. Null until she is sold. A beast bred on the farm was bought for nothing.
 */
export const marginOf = ({
  costs,
  purchaseBdt,
  saleBdt,
}: {
  costs: Costs;
  purchaseBdt: number | null;
  saleBdt: number | null;
}): number | null =>
  saleBdt === null
    ? null
    : roundTaka(saleBdt - (purchaseBdt ?? 0) - spentOn(costs));

/** What each kilogram an Animal put on cost: everything she cost over the weight she gained. Null for an
 *  animal who has not gained. */
export const costOfGainOf = (
  costs: Costs,
  gainKg: number | null
): number | null =>
  gainKg !== null && gainKg > 0 ? roundTaka(spentOn(costs) / gainKg) : null;

/** A dairy cow's Cost per Litre: what she cost over the litres she sent to Bulk. Null for none sent. */
export const costPerLitreOf = (
  costs: Costs,
  litresToBulk: number
): number | null =>
  litresToBulk > 0 ? roundTaka(spentOn(costs) / litresToBulk) : null;
