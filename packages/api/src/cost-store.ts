import type { Database } from "@OpenFarm/db";
import type {
  CostShare,
  Costs,
  FeedShare,
  FeedingToCost,
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
  sidesOverTime,
  tripShares,
} from "@OpenFarm/domain";

import { movementsByItem } from "./stock-store";
import { tripCostOf } from "./trip-store";

type Db = Pick<Database, "query" | "execute">;
type Side = PenHistoryLine["side"];

/** One dose given, charged to the animal who had it: what it cost, or null when it cannot be costed. */
interface DoseShare {
  animalId: string;
  side: Side;
  at: Date;
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
  const [
    animals,
    moves,
    feedings,
    movements,
    doses,
    purchases,
    fees,
    sessions,
    buyingTrips,
    sellingTrips,
    takenOnSellingTrips,
  ] = await Promise.all([
    db.query.animal.findMany({
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
    }),
    db.query.animalMove.findMany({
      where: { farmId },
      columns: {
        id: true,
        animalId: true,
        toPenId: true,
        toSide: true,
        movedAt: true,
      },
    }),
    db.query.feeding.findMany({
      where: { farmId },
      columns: { penId: true, fedAt: true, lines: true },
    }),
    movementsByItem(db, farmId),
    db.query.treatment.findMany({
      where: { farmId, givenAt: { isNotNull: true } },
      columns: { animalId: true, productId: true, givenAt: true },
    }),
    db.query.medicinePurchase.findMany({
      where: { farmId },
      columns: {
        id: true,
        drugProductId: true,
        purchasedOn: true,
        priceBdt: true,
        doses: true,
      },
    }),
    db.query.vetFee.findMany({
      where: { farmId },
      columns: { amountBdt: true, visitedOn: true },
      with: { animals: { columns: { animalId: true } } },
    }),
    db.query.milkingSession.findMany({
      where: { farmId },
      columns: { dueAt: true },
      with: {
        records: {
          where: { destination: "bulk" },
          columns: { animalId: true, litres: true },
        },
      },
    }),
    db.query.buyingTrip.findMany({
      where: { farmId },
      columns: {
        id: true,
        brokerBdt: true,
        transportBdt: true,
        keepBdt: true,
        wentOn: true,
      },
    }),
    db.query.sellingTrip.findMany({
      where: { farmId },
      columns: { id: true, transportBdt: true, keepBdt: true, wentOn: true },
    }),
    db.query.sellingTripAnimal.findMany({}),
  ]);

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
      priceBdt: Number(one.priceBdt),
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
              vetBdt: Number(fee.amountBdt) / fee.animals.length,
            },
          ]
        : [];
    })
  );

  // The haat's toll on one beast, charged to her alone from the day she came off the lorry.
  const hasil: CostShare[] = animals.flatMap((one) =>
    one.intake && Number(one.intake.hasilBdt) > 0
      ? [
          {
            animalId: one.id,
            side: sideOf(one, one.intake.arrivedAt),
            at: one.intake.arrivedAt,
            bdt: Number(one.intake.hasilBdt),
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

  // Nothing writes this one yet: the month's Herd Costs arrive with their own ticket, and every reader
  // below is already right for the day they do.
  const herd: CostShare[] = [];

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
    unallocated: fed.unallocated,
    unallocatedTrips: outings.unallocated,
    all: {
      feed: fed.shares,
      doses: dosed,
      vet: visited,
      litres: milked,
      hasil,
      trips: outings.shares,
      herd,
    },
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

type FarmCosts = Awaited<ReturnType<typeof farmCosts>>;

/**
 * The shares a report adds up. Trips and Herd Costs are here and still empty: nothing writes them yet, and
 * everything that reads them is already right for the day something does.
 */
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
  const purchaseBdt = animal.intake
    ? Number(animal.intake.purchasePriceBdt)
    : null;
  const saleBdt = animal.sale ? Number(animal.sale.priceBdt) : null;
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
    },
  };
};
