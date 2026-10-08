import { farmDayOf, startOfFarmDay } from "./farm-clock";
import { roundKg } from "./feed";
import { groupedBy } from "./grouped-by";
import type { Side } from "./lifecycle";
import { roundMoney } from "./money";
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
  feedMoney: number;
  /** Home-grown fodder at no price costs nothing — and the farm is told how much of it there was. */
  unpricedKg: number;
}

/**
 * One Animal's share of something charged to her by the head rather than by what she ate: the Market toll the
 * livestock market took on her, a Buying or Selling Trip she was on, a month's Herd Costs. One shape for the three,
 * because each is only ever an animal, a moment and an amount.
 */
export interface CostShare {
  animalId: string;
  side: Side;
  at: Date;
  amount: number;
  /** What it came from: the Category of a Herd Cost, or the outing or livestock market a by-the-head cost was
   *  paid at. Always said, so a month's charges can be named rather than only totaled. */
  fromId: string;
  /** The days it is for: her days in the month a Herd Cost is split over. Nothing for a cost of one moment. */
  over?: { from: Date; until: Date };
}

/** One outing, as its cost is split: what it cost beyond the animals, and who came home on it. */
export interface TripToSplit {
  id: string;
  at: Date;
  costMoney: number;
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
  amount: number;
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
    if (trip.costMoney === 0) {
      continue;
    }
    const theirs = byTrip.get(trip.id) ?? [];
    if (theirs.length === 0) {
      unallocated.push({ at: trip.at, amount: trip.costMoney });
      continue;
    }
    const each = trip.costMoney / theirs.length;
    shares.push(
      ...theirs.map((one) => ({
        animalId: one.animalId,
        side: one.side,
        fromId: trip.id,
        at: one.at,
        amount: each,
      }))
    );
  }
  return { shares, unallocated };
};

/** One month's marked money for one Side: what it was, when, and which Side's animals carry it. */
export interface HerdCostToSplit {
  at: Date;
  side: Side;
  amount: number;
  /** The Category the Owner marked as charged to the animals. */
  categoryId: string;
}

/** A month's marked money no animal was standing for: charged to nobody, and said. */
export interface UnallocatedHerdCost {
  at: Date;
  amount: number;
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

/** A month — "YYYY-MM", or any farm day in it — as a count of months, so that a January reaches back into the December
 *  before it by subtracting one. */
export const monthIndexOf = (monthOrDay: string): number =>
  Number(monthOrDay.slice(0, 4)) * 12 + Number(monthOrDay.slice(5, 7)) - 1;

/** A count of months back as the "YYYY-MM" it stands for. */
export const monthAt = (index: number): string =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

/**
 * The `count` months that end with the one a farm day falls in, oldest first, as "YYYY-MM": this month and the ones
 * before it. Counted in years and months, as `monthOf` is, so a January reaches back into the December before it.
 */
export const monthsEndingIn = (day: string, count: number): string[] => {
  const last = monthIndexOf(day);
  return Array.from({ length: count }, (_, index) =>
    monthAt(last - (count - 1) + index)
  );
};

/** Whose an Animal was from when: each owner from the moment they took her on, oldest first — a Venture's id, or
 *  `null` for the Farm's own. An Animal nobody sold between owners has none. */
export type OwnersOverTime = ReadonlyMap<
  string,
  readonly { from: Date; ventureId: string | null }[]
>;

/** One stretch of one owner's time with an Animal on one Side inside a month: how long, and its first and last
 *  moments — the span a share of that month may be dated in. */
interface Stretch {
  ms: number;
  since: number;
  until: number;
}

/**
 * How long one Animal stood on one Side inside a month, cut where she changed owner: one stretch for each owner she
 * had that month, in the order she had them. Her owners' days are cut at the moment each took her on, which is the
 * start of the day an Internal Sale was made on.
 */
const standingIn = (
  lines: readonly PenHistoryLine[],
  side: Side,
  { from, until }: { from: Date; until: Date },
  owners: readonly { from: Date }[]
): Stretch[] => {
  // The moments inside the month at which she became somebody else's.
  const cuts = owners
    .map((one) => one.from.getTime())
    .filter((at) => at > from.getTime() && at < until.getTime());
  const edges = [from.getTime(), ...cuts, until.getTime()];
  const stretches: Stretch[] = [];
  for (const [index, start] of edges.slice(0, -1).entries()) {
    const end = edges[index + 1] ?? until.getTime();
    let ms = 0;
    let since = end;
    let last = start;
    for (const line of lines) {
      if (line.side !== side) {
        continue;
      }
      const lineStart = Math.max(line.from.getTime(), start);
      const lineEnd = Math.min((line.until ?? until).getTime(), end);
      if (lineEnd > lineStart) {
        ms += lineEnd - lineStart;
        since = Math.min(since, lineStart);
        last = Math.max(last, lineEnd);
      }
    }
    if (ms > 0) {
      stretches.push({ ms, since, until: last });
    }
  }
  return stretches;
};

/**
 * What the farm spent on the animals without naming any of them, charged to the animals of that Side by
 * the days each stood here in the month the money belongs to. An Animal who arrived mid-month carries her
 * days and no more; one who left before it carries none; and a month with nobody standing is charged to
 * nobody and said, the way a Feeding nobody stood for is.
 *
 * Each part is dated inside the days it is for — never before she came and never after she left — so a sum that asks
 * what was charged while she was here finds it whenever in the month the money was entered. And where she changed
 * owner in the month, her part is cut between them by the days each held her, each piece dated inside its owner's
 * days (CONTEXT.md, Herd Cost; Holding).
 */
export const herdShares = ({
  costs,
  history,
  owners = new Map(),
}: {
  costs: readonly HerdCostToSplit[];
  history: readonly PenHistoryLine[];
  owners?: OwnersOverTime;
}): { shares: CostShare[]; unallocated: UnallocatedHerdCost[] } => {
  const byAnimal = groupedBy(history, (line) => line.animalId);
  const shares: CostShare[] = [];
  const unallocated: UnallocatedHerdCost[] = [];
  for (const cost of costs) {
    const month = monthOf(cost.at);
    const stood = [...byAnimal.entries()].flatMap(([animalId, lines]) =>
      standingIn(lines, cost.side, month, owners.get(animalId) ?? []).map(
        (stretch) => ({ animalId, ...stretch })
      )
    );
    const total = stood.reduce((sum, one) => sum + one.ms, 0);
    if (total === 0) {
      unallocated.push({ at: cost.at, amount: cost.amount });
      continue;
    }
    shares.push(
      ...stood.map((one) => ({
        animalId: one.animalId,
        side: cost.side,
        // Inside the days it is for: a share dated the 3rd for a beast who came on the 20th would be read into
        // periods she had nothing to do with, and one dated the 31st for a bull sold on the 10th into days
        // after he had gone. The last moment is short of her leaving by a millisecond, which is still hers.
        at: new Date(
          Math.min(Math.max(cost.at.getTime(), one.since), one.until - 1)
        ),
        amount: (cost.amount * one.ms) / total,
        fromId: cost.categoryId,
        over: { from: new Date(one.since), until: new Date(one.until) },
      }))
    );
  }
  return { shares, unallocated };
};

/** A Feeding nobody can be found standing for: charged to nobody, and said. */
export interface UnallocatedFeeding {
  at: Date;
  feedMoney: number;
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
    let feedMoney = 0;
    let unpricedKg = 0;
    for (const line of fed.lines) {
      const price = priceOf(line.feedItemId, fed.fedAt);
      const lineMoney = price === null ? 0 : price * line.givenKg;
      const lineUnpricedKg = price === null ? line.givenKg : 0;
      feedMoney += lineMoney;
      unpricedKg += lineUnpricedKg;
      // One share per item per animal: the sum is what it always was, and what a month cost can now be
      // read back as the sacks that made it.
      for (const who of standing) {
        shares.push({
          animalId: who.animalId,
          side: who.side,
          at: fed.fedAt,
          feedItemId: line.feedItemId,
          feedMoney: lineMoney / standing.length,
          unpricedKg: lineUnpricedKg / standing.length,
        });
      }
    }
    if (standing.length === 0) {
      unallocated.push({ at: fed.fedAt, feedMoney, unpricedKg });
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
    priceMoney: number;
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
  return recent.reduce((sum, one) => sum + one.priceMoney, 0) / doses;
};

/** What an Animal has cost, added up from her shares. */
export interface Costs {
  feedMoney: number;
  unpricedKg: number;
  medicineMoney: number;
  /** Doses of products the farm had not bought by then, shown rather than counted as free. */
  uncostedDoses: number;
  /** Her share of the Vet Fees for visits that named her. */
  vetMoney: number;
  /** The Market toll the livestock market took on her, charged to her alone. */
  marketTollMoney: number;
  /** Her share of the Buying Trip that brought her and the Selling Trips that took her. */
  tripMoney: number;
  /** Her share of the Herd Costs of the Side she stood on, by the days she stood there. */
  herdMoney: number;
}

const spentOn = (costs: Costs): number =>
  costs.feedMoney +
  costs.medicineMoney +
  costs.vetMoney +
  costs.marketTollMoney +
  costs.tripMoney +
  costs.herdMoney;

/** Costs as the farm reads them: to the poisha and to the kilo. */
export const roundedCosts = (costs: Costs): Costs => ({
  feedMoney: roundMoney(costs.feedMoney),
  unpricedKg: roundKg(costs.unpricedKg),
  medicineMoney: roundMoney(costs.medicineMoney),
  uncostedDoses: costs.uncostedDoses,
  vetMoney: roundMoney(costs.vetMoney),
  marketTollMoney: roundMoney(costs.marketTollMoney),
  tripMoney: roundMoney(costs.tripMoney),
  herdMoney: roundMoney(costs.herdMoney),
});

/**
 * A fattening Animal's Margin: her sale price less her purchase price and everything she cost — her feed,
 * her doses, the Vet's visits that named her, the Market toll paid on her, the Trips that moved her and her
 * share of the Herd Costs. Null until she is sold. A beast bred on the farm was bought for nothing.
 */
export const marginOf = ({
  costs,
  purchaseMoney,
  saleMoney,
}: {
  costs: Costs;
  purchaseMoney: number | null;
  saleMoney: number | null;
}): number | null =>
  saleMoney === null
    ? null
    : roundMoney(saleMoney - (purchaseMoney ?? 0) - spentOn(costs));

/** What each kilogram an Animal put on cost: everything she cost over the weight she gained. Null for an
 *  animal who has not gained. */
export const costOfGainOf = (
  costs: Costs,
  gainKg: number | null
): number | null =>
  gainKg !== null && gainKg > 0 ? roundMoney(spentOn(costs) / gainKg) : null;

/** A dairy cow's Cost per Liter: what she cost over the liters she sent to Bulk. Null for none sent. */
export const costPerLiterOf = (
  costs: Costs,
  litersToBulk: number
): number | null =>
  litersToBulk > 0 ? roundMoney(spentOn(costs) / litersToBulk) : null;
