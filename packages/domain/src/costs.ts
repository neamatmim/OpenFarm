import { farmDayOf, startOfFarmDay } from "./farm-clock";
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
  /** Which Feed Item she ate. One share per item rather than per feeding, so what a month cost can be
   *  read back as the sacks it was made of — an Investor asks what his animals ate, not what the
   *  total was. */
  feedItemId: string;
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
  /** What it came from: the Category of a Herd Cost, or the outing or haat a by-the-head cost was
   *  paid at. Always said, so a month's charges can be named rather than only totalled. */
  fromId: string;
}

/** One outing, as its cost is split: what it cost beyond the animals, and who came home on it. */
export interface TripToSplit {
  id: string;
  at: Date;
  costBdt: number;
}

/** An Animal an outing carried: which one, when it went, and the Side she stood on then. */
export interface Carried {
  animalId: string;
  tripId: string;
  side: Side;
  at: Date;
}

/** An outing nobody came home on: charged to nobody, and said. */
export interface UnallocatedTrip {
  at: Date;
  bdt: number;
}

/**
 * What the outings cost, charged to the Animals they carried: split evenly, because the lorry was hired for
 * all of them and not for one. An outing that carried nobody — none bought, or every arrival corrected off
 * it — is charged to nobody and said, the way a Feeding nobody stood for is.
 */
export const tripShares = ({
  trips,
  carried,
}: {
  trips: readonly TripToSplit[];
  carried: readonly Carried[];
}): { shares: CostShare[]; unallocated: UnallocatedTrip[] } => {
  const byTrip = groupedBy(carried, (one) => one.tripId);
  const shares: CostShare[] = [];
  const unallocated: UnallocatedTrip[] = [];
  for (const trip of trips) {
    if (trip.costBdt === 0) {
      continue;
    }
    const theirs = byTrip.get(trip.id) ?? [];
    if (theirs.length === 0) {
      unallocated.push({ at: trip.at, bdt: trip.costBdt });
      continue;
    }
    const each = trip.costBdt / theirs.length;
    shares.push(
      ...theirs.map((one) => ({
        animalId: one.animalId,
        side: one.side,
        fromId: trip.id,
        at: one.at,
        bdt: each,
      }))
    );
  }
  return { shares, unallocated };
};

/** One month's marked money for one Side: what it was, when, and which Side's animals carry it. */
export interface HerdCostToSplit {
  at: Date;
  side: Side;
  bdt: number;
  /** The Category the Owner marked as charged to the animals. */
  categoryId: string;
}

/** A month's marked money no animal was standing for: charged to nobody, and said. */
export interface UnallocatedHerdCost {
  at: Date;
  bdt: number;
}

/**
 * The month one day falls in, as the farm's own day begins and ends it. Counted in years and months rather
 * than by adding a month to a date: a month added to the 31st of January lands on the 3rd of March, and
 * February would swallow the animals standing in March.
 */
const firstOfMonth = (year: number, month: number): Date =>
  startOfFarmDay(`${year}-${String(month).padStart(2, "0")}-01`);

export const monthOf = (at: Date): { from: Date; until: Date } => {
  const day = farmDayOf(at);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return {
    from: firstOfMonth(year, month),
    until:
      month === 12 ? firstOfMonth(year + 1, 1) : firstOfMonth(year, month + 1),
  };
};

/** How long one Animal stood on one Side inside a month, and from when: the time she carries a share of
 *  that month for, and the first moment she was here to carry it. */
const standingIn = (
  lines: readonly PenHistoryLine[],
  side: Side,
  { from, until }: { from: Date; until: Date }
): { ms: number; since: Date } => {
  let ms = 0;
  let since = until.getTime();
  for (const line of lines) {
    if (line.side !== side) {
      continue;
    }
    const start = Math.max(line.from.getTime(), from.getTime());
    const end = Math.min((line.until ?? until).getTime(), until.getTime());
    if (end > start) {
      ms += end - start;
      since = Math.min(since, start);
    }
  }
  return { ms, since: new Date(since) };
};

/**
 * What the farm spent on the animals without naming any of them, charged to the animals of that Side by
 * the days each stood here in the month the money belongs to. An Animal who arrived mid-month carries her
 * days and no more; one who left before it carries none; and a month with nobody standing is charged to
 * nobody and said, the way a Feeding nobody stood for is.
 */
export const herdShares = ({
  costs,
  history,
}: {
  costs: readonly HerdCostToSplit[];
  history: readonly PenHistoryLine[];
}): { shares: CostShare[]; unallocated: UnallocatedHerdCost[] } => {
  const byAnimal = groupedBy(history, (line) => line.animalId);
  const shares: CostShare[] = [];
  const unallocated: UnallocatedHerdCost[] = [];
  for (const cost of costs) {
    const month = monthOf(cost.at);
    const stood = [...byAnimal.entries()].map(([animalId, lines]) => ({
      animalId,
      ...standingIn(lines, cost.side, month),
    }));
    const total = stood.reduce((sum, one) => sum + one.ms, 0);
    if (total === 0) {
      unallocated.push({ at: cost.at, bdt: cost.bdt });
      continue;
    }
    shares.push(
      ...stood
        .filter((one) => one.ms > 0)
        .map((one) => ({
          animalId: one.animalId,
          side: cost.side,
          // Not before she was here: a share dated the 3rd for a beast who came on the 20th would be
          // read into periods she had nothing to do with.
          at: one.since > cost.at ? one.since : cost.at,
          bdt: (cost.bdt * one.ms) / total,
          fromId: cost.categoryId,
        }))
    );
  }
  return { shares, unallocated };
};

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
    const standing = (byPen.get(fed.penId) ?? []).filter((line) =>
      covers(line, fed.fedAt)
    );
    let feedBdt = 0;
    let unpricedKg = 0;
    for (const line of fed.lines) {
      const price = priceOf(line.feedItemId, fed.fedAt);
      const lineBdt = price === null ? 0 : price * line.givenKg;
      const lineUnpricedKg = price === null ? line.givenKg : 0;
      feedBdt += lineBdt;
      unpricedKg += lineUnpricedKg;
      // One share per item per animal: the sum is what it always was, and what a month cost can now be
      // read back as the sacks that made it.
      for (const who of standing) {
        shares.push({
          animalId: who.animalId,
          side: who.side,
          at: fed.fedAt,
          feedItemId: line.feedItemId,
          feedBdt: lineBdt / standing.length,
          unpricedKg: lineUnpricedKg / standing.length,
        });
      }
    }
    if (standing.length === 0) {
      unallocated.push({ at: fed.fedAt, feedBdt, unpricedKg });
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
