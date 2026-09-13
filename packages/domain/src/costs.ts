import { roundTaka } from "./money";

type Side = "dairy" | "fattening";

/** Things gathered under the key each belongs to. */
const groupedBy = <T>(
  items: readonly T[],
  keyOf: (item: T) => string
): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
};

/** Where an Animal stood, and on which Side, from one move until the next — or until she left. */
export interface Stay {
  animalId: string;
  penId: string;
  side: Side;
  from: Date;
  /** When she moved on or left the farm; null while she is still there. */
  until: Date | null;
}

/**
 * Every Animal's stays, from her moves and the day she left. The first move is the one that put her on
 * the farm; each later one ends the stay before it.
 */
export const staysOf = (
  moves: readonly {
    animalId: string;
    toPenId: string;
    toSide: Side;
    movedAt: Date;
  }[],
  leftAt: ReadonlyMap<string, Date>
): Stay[] => {
  const byAnimal = groupedBy(moves, (move) => move.animalId);
  return [...byAnimal.entries()].flatMap(([animalId, hers]) => {
    const inOrder = hers.toSorted(
      (a, b) => a.movedAt.getTime() - b.movedAt.getTime()
    );
    return inOrder.map((move, index) => ({
      animalId,
      penId: move.toPenId,
      side: move.toSide,
      from: move.movedAt,
      until: inOrder[index + 1]?.movedAt ?? leftAt.get(animalId) ?? null,
    }));
  });
};

const isStandingIn = (stay: Stay, penId: string, at: Date): boolean =>
  stay.penId === penId &&
  stay.from <= at &&
  (stay.until === null || at < stay.until);

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
 * What the Pens were fed, charged to the animals that ate it (the feed decision, 2026-09-10): each Feed
 * Item's weighted-average price at the time, times what was given, split evenly across the animals
 * standing in the Pen when it was fed. Session by session, that is the split by animal-days.
 *
 * A Feeding nobody can be found standing for — a Pen fed after its last animal left, as the records have
 * it — is not charged to anybody, and is said as unallocated rather than quietly spread elsewhere.
 */
export const feedShares = ({
  feedings,
  stays,
  priceOf,
}: {
  feedings: readonly FeedingToCost[];
  stays: readonly Stay[];
  priceOf: (feedItemId: string, at: Date) => number | null;
}): { shares: FeedShare[]; unallocatedBdt: number } => {
  const byPen = groupedBy(stays, (stay) => stay.penId);
  const shares: FeedShare[] = [];
  let unallocatedBdt = 0;
  for (const fed of feedings) {
    let costBdt = 0;
    let unpricedKg = 0;
    for (const line of fed.lines) {
      const price = priceOf(line.feedItemId, fed.fedAt);
      if (price === null) {
        unpricedKg += line.givenKg;
      } else {
        costBdt += price * line.givenKg;
      }
    }
    const standing = (byPen.get(fed.penId) ?? []).filter((stay) =>
      isStandingIn(stay, fed.penId, fed.fedAt)
    );
    if (standing.length === 0) {
      unallocatedBdt += costBdt;
      continue;
    }
    for (const stay of standing) {
      shares.push({
        animalId: stay.animalId,
        side: stay.side,
        at: fed.fedAt,
        feedBdt: costBdt / standing.length,
        unpricedKg: unpricedKg / standing.length,
      });
    }
  }
  return { shares, unallocatedBdt: roundTaka(unallocatedBdt) };
};

/** How many of a product's latest purchases a dose is costed over. */
export const PURCHASES_A_DOSE_IS_COSTED_OVER = 3;

/**
 * What one dose of a product cost: its most recent purchases before the dose, what they cost together
 * divided by the doses they held (the Owner's decision, 2026-09-13). Null for a product the farm had not
 * bought by then: a dose nobody paid for as far as the records know is uncosted, never free.
 */
export const dosePriceOf = (
  purchases: readonly { purchasedOn: Date; priceBdt: number; doses: number }[],
  givenAt: Date
): number | null => {
  const recent = purchases
    .filter((one) => one.purchasedOn <= givenAt)
    .toSorted((a, b) => b.purchasedOn.getTime() - a.purchasedOn.getTime())
    .slice(0, PURCHASES_A_DOSE_IS_COSTED_OVER);
  const doses = recent.reduce((sum, one) => sum + one.doses, 0);
  if (doses === 0) {
    return null;
  }
  return recent.reduce((sum, one) => sum + one.priceBdt, 0) / doses;
};

/** What an Animal has cost and earned, from her own records. */
export interface AnimalEconomics {
  feedBdt: number;
  unpricedKg: number;
  medicineBdt: number;
  /** Doses of products the farm had not bought by then, shown rather than counted as free. */
  uncostedDoses: number;
  purchaseBdt: number | null;
  saleBdt: number | null;
  /** Sale less purchase, feed and medicine; null until she is sold. */
  marginBdt: number | null;
  litresToBulk: number;
  /** Feed and medicine per litre sent to Bulk; null for an animal who sent none. */
  costPerLitreBdt: number | null;
}

/**
 * A fattening animal's margin and a dairy cow's cost per litre, worked out and never stored. A beast
 * bred on the farm was bought for nothing.
 */
export const economicsOf = ({
  feedBdt,
  unpricedKg,
  medicineBdt,
  uncostedDoses,
  purchaseBdt,
  saleBdt,
  litresToBulk,
}: Omit<AnimalEconomics, "marginBdt" | "costPerLitreBdt">): AnimalEconomics => {
  const cost = feedBdt + medicineBdt;
  return {
    feedBdt: roundTaka(feedBdt),
    unpricedKg: Math.round(unpricedKg * 10) / 10,
    medicineBdt: roundTaka(medicineBdt),
    uncostedDoses,
    purchaseBdt,
    saleBdt,
    marginBdt:
      saleBdt === null ? null : roundTaka(saleBdt - (purchaseBdt ?? 0) - cost),
    litresToBulk: Math.round(litresToBulk * 100) / 100,
    costPerLitreBdt: litresToBulk > 0 ? roundTaka(cost / litresToBulk) : null,
  };
};
