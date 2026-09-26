import type { Database } from "@OpenFarm/db";
import type {
  CostShare,
  Costs,
  FeedShare,
  FeedingToCost,
  HerdCostToSplit,
  PenHistoryLine,
} from "@OpenFarm/domain";
import {
  exitOf,
  costOfGainOf,
  costPerLitreOf,
  dosePriceOf,
  feedShares,
  groupedBy,
  marginOf,
  penHistoryOf,
  priceHistory,
  roundKg,
  roundLitres,
  roundTaka,
  roundedCosts,
  herdShares,
  sidesOverTime,
  tripShares,
} from "@OpenFarm/domain";

import { THE_FARMS_PURSE } from "./money-store";
import { movementsByItem } from "./stock-store";
import { tripCostOf } from "./trip-store";

type Db = Pick<Database, "query" | "execute">;
type Side = PenHistoryLine["side"];

/** One dose given, charged to the animal who had it: what it cost, or null when it cannot be costed. */
interface DoseShare {
  animalId: string;
  side: Side;
  at: Date;
  /** Which medicine she was given, so a month's doses can be named rather than counted. */
  drugProductId: string;
  medicineBdt: number | null;
}

/** One animal's share of a Vet Fee for a visit that named her. */
interface VetShare {
  animalId: string;
  side: Side;
  at: Date;
  vetBdt: number;
}

/** Litres one animal sent to Bulk in one Milking Session. */
interface LitresShare {
  animalId: string;
  side: Side;
  at: Date;
  litres: number;
}

/** Shares gathered under the animal each is charged to. */
const byAnimal = <T extends { animalId: string }>(shares: readonly T[]) =>
  groupedBy(shares, (one) => one.animalId);

/**
 * Money entered by hand as a Herd Cost, or nothing where it is charged to no animal at all: a Side left
 * unsaid, or a Category the Owner never marked as the herd's.
 *
 * One rule in one place, because a Correction asks which Ventures a Herd Cost reaches and has to be told
 * what the costing would say — a condition added here and not there is a charge that moves a settled
 * Venture's figures with nobody refused.
 */
export const herdCostOf = (money: {
  at: Date;
  side: Side | null;
  categoryId: string;
  chargedToAnimals: boolean;
  bdt: number;
}): HerdCostToSplit | null =>
  money.side !== null && money.chargedToAnimals
    ? {
        at: money.at,
        side: money.side,
        bdt: money.bdt,
        categoryId: money.categoryId,
      }
    : null;

/** A Feeding's lines as the jsonb column holds them, read without trusting their shape. */
const linesOf = (lines: unknown): FeedingToCost["lines"] =>
  Array.isArray(lines)
    ? lines.flatMap((line: unknown) => {
        if (typeof line !== "object" || line === null) {
          return [];
        }
        const { feedItemId, givenKg } = line as Record<string, unknown>;
        return typeof feedItemId === "string"
          ? [{ feedItemId, givenKg: Number(givenKg ?? 0) }]
          : [];
      })
    : [];

/**
 * Everything the farm's costs are worked out from, charged to its animals: every Feeding split across the
 * animals standing in its Pen, every dose charged to the animal who had it, every Vet Fee split across the
 * animals the Vet named, and every litre each cow sent to Bulk. Worked out afresh, never stored, so a
 * corrected Feeding or a Purchase written up late moves it without anybody having to remember to.
 *
 * The whole farm's history at once: a Margin is a whole life's costs, and a Pen's split needs everybody
 * who stood in it.
 */
export const farmCosts = async (db: Db, farmId: string) => {
  // Callers may hand this function a transaction. PostgreSQL gives that transaction one client, so these reads
  // must stay sequential even though a pool-backed call could run them concurrently.
  const animals = await db.query.animal.findMany({
    where: { farmId },
    columns: {
      id: true,
      tagNumber: true,
      side: true,
      state: true,
      stateChangedAt: true,
      lactationStartedAt: true,
    },
    with: {
      intake: {
        columns: {
          id: true,
          purchasePriceBdt: true,
          hasilBdt: true,
          buyingTripId: true,
          weightKg: true,
          arrivedAt: true,
        },
      },
      sale: { columns: { priceBdt: true, soldAt: true, weightKg: true } },
      weighIns: {
        columns: { weightKg: true },
        orderBy: { weighedAt: "desc", id: "desc" },
        limit: 1,
      },
    },
  });
  const moves = await db.query.animalMove.findMany({
    where: { farmId },
    columns: {
      id: true,
      animalId: true,
      toPenId: true,
      toSide: true,
      movedAt: true,
    },
  });
  const feedings = await db.query.feeding.findMany({
    where: { farmId },
    columns: { penId: true, fedAt: true, lines: true },
  });
  const movements = await movementsByItem(db, farmId);
  const doses = await db.query.treatment.findMany({
    where: { farmId, givenAt: { isNotNull: true } },
    columns: { animalId: true, productId: true, givenAt: true },
  });
  const purchases = await db.query.medicinePurchase.findMany({
    where: { farmId },
    columns: {
      id: true,
      drugProductId: true,
      purchasedOn: true,
      priceBdt: true,
      doses: true,
    },
  });
  const fees = await db.query.vetFee.findMany({
    where: { farmId },
    columns: { amountBdt: true, visitedOn: true },
    with: { animals: { columns: { animalId: true } } },
  });
  const sessions = await db.query.milkingSession.findMany({
    where: { farmId },
    columns: { dueAt: true },
    with: {
      records: {
        where: { destination: "bulk" },
        columns: { animalId: true, litres: true },
      },
    },
  });
  const buyingTrips = await db.query.buyingTrip.findMany({
    where: { farmId },
    columns: {
      id: true,
      brokerBdt: true,
      transportBdt: true,
      keepBdt: true,
      wentOn: true,
    },
  });
  const sellingTrips = await db.query.sellingTrip.findMany({
    where: { farmId },
    columns: {
      id: true,
      transportBdt: true,
      keepBdt: true,
      wentOn: true,
      // Where it went, so a month's charges can name the outing rather than only total it.
      wentTo: true,
    },
  });
  const takenOnSellingTrips = await db.query.sellingTripAnimal.findMany({});
  // Money the farm entered by hand under a Category the Owner marked as charged to the animals.
  const enteredByHand = await db.query.moneyEvent.findMany({
    // The Farm's purse alone: this money is split across the Animals of its Side, and a Venture's own
    // cost split that way would charge the Farm's animals for somebody else's spending. A Venture's
    // hand-entered cost belongs to that Venture's own Animals, which is the buying increment's to do —
    // until then nothing writes one, and one written today would be charged to nobody.
    where: {
      farmId,
      source: "by_hand",
      side: { isNotNull: true },
      purseVentureId: THE_FARMS_PURSE,
    },
    columns: {
      amountBdt: true,
      occurredAt: true,
      side: true,
      categoryId: true,
    },
    with: { category: { columns: { chargedToAnimals: true } } },
  });

  // When each animal left, as her record says it: her Pen history ends there, so nothing is charged to a cow
  // for feed put out after she had gone.
  const leftAt = new Map(
    animals.flatMap((one) => {
      const exit = exitOf(one);
      return exit ? [[one.id, exit.at] as const] : [];
    })
  );
  const history = penHistoryOf(moves, leftAt);
  const sideOf = sidesOverTime(history);
  const byId = new Map(animals.map((one) => [one.id, one]));

  const prices = new Map<string, (at: Date) => number | null>();
  const priceOf = (feedItemId: string, at: Date) => {
    let lookup = prices.get(feedItemId);
    if (!lookup) {
      lookup = priceHistory(movements.get(feedItemId) ?? []);
      prices.set(feedItemId, lookup);
    }
    return lookup(at);
  };
  const fed = feedShares({
    feedings: feedings.map((one) => ({
      penId: one.penId,
      fedAt: one.fedAt,
      lines: linesOf(one.lines),
    })),
    history,
    priceOf,
  });

  const purchasesOf = groupedBy(
    purchases.map((one) => ({
      id: one.id,
      drugProductId: one.drugProductId,
      purchasedOn: one.purchasedOn,
      priceBdt: one.priceBdt,
      doses: one.doses,
    })),
    (one) => one.drugProductId
  );
  const dosed: DoseShare[] = doses.flatMap((one) => {
    const animal = byId.get(one.animalId);
    return animal && one.givenAt
      ? [
          {
            animalId: one.animalId,
            side: sideOf(animal, one.givenAt),
            at: one.givenAt,
            drugProductId: one.productId,
            medicineBdt: dosePriceOf(
              purchasesOf.get(one.productId) ?? [],
              one.givenAt
            ),
          },
        ]
      : [];
  });

  const visited: VetShare[] = fees.flatMap((fee) =>
    fee.animals.flatMap(({ animalId }) => {
      const animal = byId.get(animalId);
      return animal
        ? [
            {
              animalId,
              side: sideOf(animal, fee.visitedOn),
              at: fee.visitedOn,
              vetBdt: fee.amountBdt / fee.animals.length,
            },
          ]
        : [];
    })
  );

  // The haat's toll on one beast, charged to her alone from the day she came off the lorry.
  const hasil: CostShare[] = animals.flatMap((one) =>
    one.intake && one.intake.hasilBdt > 0
      ? [
          {
            animalId: one.id,
            side: sideOf(one, one.intake.arrivedAt),
            at: one.intake.arrivedAt,
            fromId: one.intake.id,
            bdt: one.intake.hasilBdt,
          },
        ]
      : []
  );
  // Who stood on which lorry, by outing.
  const takenOn = groupedBy(
    takenOnSellingTrips.filter((one) => byId.has(one.animalId)),
    (one) => one.sellingTripId
  );

  // What the outings cost beyond the animals, charged to the Animals they carried: those that came home on
  // a Buying Trip, and every Animal taken on a Selling Trip, sold or brought home again.
  const outings = tripShares({
    trips: [...buyingTrips, ...sellingTrips].map((one) => ({
      id: one.id,
      at: one.wentOn,
      costBdt: tripCostOf(one),
    })),
    carried: [
      ...animals.flatMap((one) =>
        one.intake?.buyingTripId
          ? [
              {
                animalId: one.id,
                tripId: one.intake.buyingTripId,
                side: sideOf(one, one.intake.arrivedAt),
                at: one.intake.arrivedAt,
              },
            ]
          : []
      ),
      ...sellingTrips.flatMap(
        (trip) =>
          takenOn.get(trip.id)?.flatMap(({ animalId }) => {
            const one = byId.get(animalId);
            return one
              ? [
                  {
                    animalId,
                    tripId: trip.id,
                    side: sideOf(one, trip.wentOn),
                    at: trip.wentOn,
                  },
                ]
              : [];
          }) ?? []
      ),
    ],
  });

  // What the farm spent on the animals without naming any of them, by the days each stood here.
  const herdCosts = herdShares({
    costs: enteredByHand.flatMap((one) => {
      const cost = herdCostOf({
        at: one.occurredAt,
        side: one.side,
        categoryId: one.categoryId,
        chargedToAnimals: one.category?.chargedToAnimals ?? false,
        bdt: one.amountBdt,
      });
      return cost ? [cost] : [];
    }),
    history,
  });
  const herd = herdCosts.shares;

  const milked: LitresShare[] = sessions.flatMap((session) =>
    session.records.flatMap((record) => {
      const animal = byId.get(record.animalId);
      return animal
        ? [
            {
              animalId: record.animalId,
              side: sideOf(animal, session.dueAt),
              at: session.dueAt,
              litres: Number(record.litres),
            },
          ]
        : [];
    })
  );

  return {
    animals,
    sideOf,
    // Where every Animal stood and when, which the splits above were worked out from. Said, so that a
    // question the shares cannot answer — which animals a Herd Cost would be split across were it moved to
    // another month, who stood in a Pen the morning a Step was done — is answered from the same history
    // rather than from a second reading of the Moves.
    history,
    unallocated: fed.unallocated,
    unallocatedTrips: outings.unallocated,
    unallocatedHerd: herdCosts.unallocated,
    all: {
      feed: fed.shares,
      doses: dosed,
      vet: visited,
      litres: milked,
      hasil,
      trips: outings.shares,
      herd,
    },
    /**
     * Which outings were Selling Trips, and what each was called.
     *
     * The two kinds of outing are charged the same way and shown on one line, but they are paid for
     * quite differently: a Buying Trip comes out of the Buying Float, drawn before the lorry goes and
     * counted against it the same evening, while a Selling Trip happens long after that Float is shut.
     * So the monthly Reimbursement has to be able to tell them apart, and this is what tells it.
     */
    sellingTrips: new Map(
      sellingTrips.map((one) => [one.id, one.wentTo] as const)
    ),
    ofAnimal: {
      feed: byAnimal(fed.shares),
      doses: byAnimal(dosed),
      vet: byAnimal(visited),
      litres: byAnimal(milked),
      hasil: byAnimal(hasil),
      trips: byAnimal(outings.shares),
      herd: byAnimal(herd),
    },
  };
};

export type FarmCosts = Awaited<ReturnType<typeof farmCosts>>;

/** The shares a report adds up: what she ate, what she was dosed and visited for, what her arrival and the
 *  outings cost, and her part of the month's Herd Costs. */
interface Shares {
  feed: readonly FeedShare[];
  doses: readonly DoseShare[];
  vet: readonly VetShare[];
  litres: readonly LitresShare[];
  hasil: readonly CostShare[];
  trips: readonly CostShare[];
  herd: readonly CostShare[];
}

/** Shares narrowed to those that pass. */
const narrowed = (
  shares: Shares,
  keep: (share: { at: Date; side: Side }) => boolean
): Shares => ({
  feed: shares.feed.filter(keep),
  doses: shares.doses.filter(keep),
  vet: shares.vet.filter(keep),
  litres: shares.litres.filter(keep),
  hasil: shares.hasil.filter(keep),
  trips: shares.trips.filter(keep),
  herd: shares.herd.filter(keep),
});

/** What one kind of by-the-head share came to. */
const bdtOf = (shares: readonly CostShare[]): number =>
  shares.reduce((sum, one) => sum + one.bdt, 0);

/** What a set of shares cost, and the litres it sent to Bulk. */
const addedUp = (shares: Shares): { costs: Costs; litresToBulk: number } => ({
  costs: {
    feedBdt: shares.feed.reduce((sum, one) => sum + one.feedBdt, 0),
    unpricedKg: shares.feed.reduce((sum, one) => sum + one.unpricedKg, 0),
    medicineBdt: shares.doses.reduce(
      (sum, one) => sum + (one.medicineBdt ?? 0),
      0
    ),
    uncostedDoses: shares.doses.filter((one) => one.medicineBdt === null)
      .length,
    vetBdt: shares.vet.reduce((sum, one) => sum + one.vetBdt, 0),
    hasilBdt: bdtOf(shares.hasil),
    tripBdt: bdtOf(shares.trips),
    herdBdt: bdtOf(shares.herd),
  },
  litresToBulk: shares.litres.reduce((sum, one) => sum + one.litres, 0),
});

type FarmAnimal = FarmCosts["animals"][number];

/** What she weighed going out, or what she last weighed on the scale; null for one never weighed. */
const lastWeightOf = (animal: FarmAnimal): number | null => {
  if (animal.sale) {
    return Number(animal.sale.weightKg);
  }
  const [latest] = animal.weighIns;
  return latest ? Number(latest.weightKg) : null;
};

/** What she weighed coming in, and what she weighs now or weighed going out: the weight she put on here.
 *  Null for a beast bred on the farm, who has no weight coming in, or one never weighed since. */
const gainOf = (animal: FarmAnimal): number | null => {
  const arrivedKg = animal.intake ? Number(animal.intake.weightKg) : null;
  const lastKg = lastWeightOf(animal);
  return arrivedKg === null || lastKg === null
    ? null
    : roundKg(lastKg - arrivedKg);
};

/** A cow in milk's current Lactation: what it has cost, what she has sent to Bulk in it, and so her Cost
 *  per Litre. Null for an animal not in a Lactation. */
const lactationOf = (animal: FarmAnimal, hers: Shares) => {
  const since = animal.lactationStartedAt;
  if (animal.side !== "dairy" || since === null) {
    return null;
  }
  const { costs, litresToBulk } = addedUp(
    narrowed(hers, (share) => share.at >= since)
  );
  return {
    since,
    ...roundedCosts(costs),
    litresToBulk: roundLitres(litresToBulk),
    costPerLitreBdt: costPerLitreOf(costs, litresToBulk),
  };
};

/**
 * One animal on the farm: what she has cost over her whole time here, what she was bought and sold for,
 * her Margin and what each kilogram she put on cost — and, for a cow in milk, what she has cost and sent
 * to Bulk in this Lactation, and so her Cost per Litre. Not over her whole life: a first-lactation cow's
 * calf and heifer years are not what her milk costs.
 */
export const economicsOfAnimal = (costs: FarmCosts, animal: FarmAnimal) => {
  const hers: Shares = {
    feed: costs.ofAnimal.feed.get(animal.id) ?? [],
    doses: costs.ofAnimal.doses.get(animal.id) ?? [],
    vet: costs.ofAnimal.vet.get(animal.id) ?? [],
    litres: costs.ofAnimal.litres.get(animal.id) ?? [],
    hasil: costs.ofAnimal.hasil.get(animal.id) ?? [],
    trips: costs.ofAnimal.trips.get(animal.id) ?? [],
    herd: costs.ofAnimal.herd.get(animal.id) ?? [],
  };
  const whole = addedUp(hers).costs;
  const purchaseBdt = animal.intake ? animal.intake.purchasePriceBdt : null;
  const saleBdt = animal.sale ? animal.sale.priceBdt : null;
  const gainKg = gainOf(animal);
  return {
    ...roundedCosts(whole),
    purchaseBdt,
    saleBdt,
    marginBdt: marginOf({ costs: whole, purchaseBdt, saleBdt }),
    gainKg,
    costOfGainBdt: costOfGainOf(whole, gainKg),
    lactation: lactationOf(animal, hers),
  };
};

/**
 * What a Venture's cattle earned: each of them, and the herd together.
 *
 * A **Margin** is the Animal's own sum and not the owner's — `CONTEXT.md` says "the same sum for every
 * Animal, whoever owns her" — so this narrows the farm's costing to her animals rather than working
 * anything out a second way. A beast still standing has no Margin at all, because she has not earned
 * anything yet; she still has a **Cost of Gain**, because she has eaten and grown.
 *
 * The herd's Cost of Gain is everything charged to all of them over everything they put on, not the mean
 * of their rates. `theirProgress` made the same choice for daily gain and said why: averaging rates lets
 * a bull who arrived last week count for as much as one who has been here since January.
 *
 * Added from the figures as each line shows them, so the total is what the column comes to rather than
 * something a paisa away from it.
 */
/** Everything charged to one animal, as her own line shows it. */
export const chargedOf = (one: Costs) =>
  one.feedBdt +
  one.medicineBdt +
  one.vetBdt +
  one.hasilBdt +
  one.tripBdt +
  one.herdBdt;

export const economicsOfHerd = (
  costs: FarmCosts,
  animalIds: ReadonlySet<string>
) => {
  const each = costs.animals
    .filter((one) => animalIds.has(one.id))
    .map((one) => ({
      tagNumber: one.tagNumber,
      ...economicsOfAnimal(costs, one),
    }));
  const chargedBdt = roundTaka(
    each.reduce((sum, one) => sum + chargedOf(one), 0)
  );
  const gainKg = roundKg(each.reduce((sum, one) => sum + (one.gainKg ?? 0), 0));
  const sold = each.filter((one) => one.marginBdt !== null);
  return {
    // Worst first: the question is which bull did not earn, and he is the one worth finding. A beast
    // with no Margin yet is not the worst of them — she is not in the running — so she follows.
    animals: each.toSorted((a, b) => {
      if (a.marginBdt === null || b.marginBdt === null) {
        return Number(a.marginBdt === null) - Number(b.marginBdt === null);
      }
      return a.marginBdt - b.marginBdt;
    }),
    soldCount: sold.length,
    /** Everyone else: those still standing, and any that died. Neither has earned a Margin. */
    unsoldCount: each.length - sold.length,
    chargedBdt,
    gainKg,
    marginBdt:
      sold.length === 0
        ? null
        : roundTaka(sold.reduce((sum, one) => sum + (one.marginBdt ?? 0), 0)),
    costOfGainBdt: gainKg > 0 ? roundTaka(chargedBdt / gainKg) : null,
  };
};

/**
 * A period added up by Side. What each Side's animals were fed, dosed and visited for in the period, and
 * the litres the Dairy side sent to Bulk in it with what a litre cost. Apart from those, the fattening
 * animals sold in the period, each with her whole-life Margin — a different sum from the period's feed,
 * and kept apart so that nobody reads one as part of the other.
 */
export const costsBySide = (
  costs: FarmCosts,
  { from, until }: { from: Date; until: Date }
) => {
  const inThePeriod = (at: Date) => at >= from && at < until;
  const onSide = (side: Side) =>
    addedUp(
      narrowed(
        costs.all,
        (share) => share.side === side && inThePeriod(share.at)
      )
    );
  const dairy = onSide("dairy");
  const fattening = onSide("fattening");
  const sold = costs.animals
    .flatMap((one) =>
      one.sale &&
      inThePeriod(one.sale.soldAt) &&
      costs.sideOf(one, one.sale.soldAt) === "fattening"
        ? [{ tagNumber: one.tagNumber, ...economicsOfAnimal(costs, one) }]
        : []
    )
    .toSorted((a, b) => a.tagNumber.localeCompare(b.tagNumber));
  const unallocated = costs.unallocated.filter((one) => inThePeriod(one.at));
  const strayTrips = costs.unallocatedTrips.filter((one) =>
    inThePeriod(one.at)
  );
  const strayHerd = costs.unallocatedHerd.filter((one) => inThePeriod(one.at));
  return {
    dairy: {
      ...roundedCosts(dairy.costs),
      litresToBulk: roundLitres(dairy.litresToBulk),
      costPerLitreBdt: costPerLitreOf(dairy.costs, dairy.litresToBulk),
    },
    fattening: roundedCosts(fattening.costs),
    soldFattening: {
      animals: sold.map(({ tagNumber, purchaseBdt, saleBdt, marginBdt }) => ({
        tagNumber,
        purchaseBdt,
        saleBdt,
        marginBdt,
      })),
      marginBdt: roundTaka(
        sold.reduce((sum, one) => sum + (one.marginBdt ?? 0), 0)
      ),
    },
    unallocated: {
      feedBdt: roundTaka(
        unallocated.reduce((sum, one) => sum + one.feedBdt, 0)
      ),
      unpricedKg: roundKg(
        unallocated.reduce((sum, one) => sum + one.unpricedKg, 0)
      ),
      tripBdt: roundTaka(strayTrips.reduce((sum, one) => sum + one.bdt, 0)),
      herdBdt: roundTaka(strayHerd.reduce((sum, one) => sum + one.bdt, 0)),
    },
  };
};

/** What each thing charged came to, added up by the thing it was. */
const groupedLines = <Share>(
  shares: readonly Share[],
  idOf: (share: Share) => string,
  takaOf: (share: Share) => number
): ConsumedLine[] => {
  const byId = new Map<string, number>();
  for (const share of shares) {
    byId.set(idOf(share), (byId.get(idOf(share)) ?? 0) + takaOf(share));
  }
  return [...byId]
    .map(([id, bdt]) => ({ id, bdt: roundTaka(bdt) }))
    .filter((line) => line.bdt > 0);
};

/** Whose an Animal was on a given day: her owner then, not her owner now. */
type OwnedThenBy = (animalId: string, at: Date) => string | null;

/**
 * The shares of one Venture's Animals, as they were its Animals at the time.
 *
 * `withItsOwn` keeps what the Venture paid for itself out of its own Buying Float — the Hasil the haat
 * took, and the Buying Trip that brought them home. A Settlement asks what the run cost whichever purse
 * the taka came from; a Reimbursement asks only what the Farm paid for and is owed back.
 *
 * A **Selling Trip** is on both sides of that line and is kept either way. It happens long after the
 * Float is shut, so the Farm pays the lorry and the men who went, and it is owed that back like the
 * feed.
 */
const hersThen = (
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  ventureId: string,
  withItsOwn: boolean
): Shares => {
  const theirsThen = (share: { animalId: string; at: Date }) =>
    ownedThenBy(share.animalId, share.at) === ventureId;
  // A Settlement asks for every outing whoever paid; a Reimbursement asks only for the ones the Farm
  // is out of pocket for, which is the Selling Trips.
  const theFarmPaidForIt = (share: { fromId: string }) =>
    withItsOwn || costs.sellingTrips.has(share.fromId);
  return {
    feed: costs.all.feed.filter(theirsThen),
    doses: costs.all.doses.filter(theirsThen),
    vet: costs.all.vet.filter(theirsThen),
    litres: [],
    hasil: withItsOwn ? costs.all.hasil.filter(theirsThen) : [],
    trips: costs.all.trips.filter(
      (share) => theirsThen(share) && theFarmPaidForIt(share)
    ),
    herd: costs.all.herd.filter(theirsThen),
  };
};

/**
 * Everything a Venture's Animals were charged over the whole run, whoever paid it.
 *
 * The same costing narrowed to the Animals that were this Venture's at the time — its Hasil and its
 * Trips too, which `consumedBy` leaves out because a Reimbursement is only about what the Farm bought and
 * is owed back. A Settlement is a different question: what did this run cost, whichever purse the taka
 * came out of. Never a second sum — the same shares, filtered.
 */
export const chargedTo = (
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  ventureId: string
) => roundedCosts(addedUp(hersThen(costs, ownedThenBy, ventureId, true)).costs);

/** One line of what a month's consumption was made of: what it was, and what it came to. */
export interface ConsumedLine {
  id: string;
  bdt: number;
}

/**
 * What one owner's Animals consumed in a period, and what it was made of.
 *
 * Only what the Farm bought for the whole herd and is owed back: feed, medicine and the vet, and the
 * Animals' share of the month's Herd Costs, and the Selling Trips that carried them.
 *
 * Not the Hasil and not a Buying Trip: those came out of the Venture's own Buying Float, drawn before
 * the lorry went and counted against it the same evening, so they were never the Farm's to be repaid
 * for. A **Selling Trip** is different and used not to be here at all — it happens long after that
 * Float is shut, the Farm pays the lorry and the men who went, and until 2026-09-19 nothing ever paid
 * the Farm back for it while the Settlement charged the Investors for it all the same.
 *
 * The total is the same costing every other reader uses, narrowed to those Animals and those days. The
 * lines are that same total taken apart, never a second sum.
 */
export const consumedBy = (
  costs: FarmCosts,
  /** Whose the Animal was on a given day: her owner then, not her owner now. */
  ownedThenBy: (animalId: string, at: Date) => string | null,
  ventureId: string,
  { from, until }: { from: Date; until: Date }
) => {
  const hers = hersThen(costs, ownedThenBy, ventureId, false);
  const inThePeriod = (at: Date) => at >= from && at < until;
  const theirs = narrowed(hers, (share) => inThePeriod(share.at));
  const { costs: summed } = addedUp(theirs);
  const feedBdt = roundTaka(summed.feedBdt);
  const medicineBdt = roundTaka(summed.medicineBdt);
  const vetBdt = roundTaka(summed.vetBdt);
  const herdBdt = roundTaka(summed.herdBdt);
  // Already only the outings the Farm paid for: `hersThen` left the Buying Trips behind.
  const tripsBdt = roundTaka(bdtOf(theirs.trips));
  return {
    feedBdt,
    medicineBdt,
    vetBdt,
    herdBdt,
    tripsBdt,
    // The sum of the parts as they are shown, not of the parts before they were rounded: five lines
    // that do not add up to the figure beneath them is the farm arguing with itself in front of an
    // Investor.
    totalBdt: roundTaka(feedBdt + medicineBdt + vetBdt + herdBdt + tripsBdt),
    /** What it was made of, so the Owner can read it to an Investor: which Feed Items, which
     *  medicines, which Categories of Herd Cost, and what each came to. */
    madeOf: {
      feed: groupedLines(
        theirs.feed,
        (one) => one.feedItemId,
        (one) => one.feedBdt
      ),
      medicine: groupedLines(
        theirs.doses,
        (one) => one.drugProductId,
        (one) => one.medicineBdt ?? 0
      ),
      herd: groupedLines(
        theirs.herd,
        (one) => one.fromId,
        (one) => one.bdt
      ),
      /** Which outings, so the line reads "the haat at Gabtoli" rather than an id. */
      trips: groupedLines(
        theirs.trips,
        (one) => one.fromId,
        (one) => one.bdt
      ),
    },
  };
};
