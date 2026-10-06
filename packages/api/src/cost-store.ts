import type { Database } from "@OpenFarm/db";
import type {
  Charge,
  OwnedThenBy,
  CostShare,
  Costs,
  FeedShare,
  FeedingToCost,
  HerdCostToSplit,
  KeepCharge,
  PenHistoryLine,
} from "@OpenFarm/domain";
import {
  HER_KEEP,
  WHAT_THE_FARM_IS_OWED,
  chargesOfOwner,
  costsOf,
  exitOf,
  costOfGainOf,
  costPerLitreOf,
  dosePriceOf,
  feedShares,
  groupedBy,
  marginOf,
  monthOf,
  penHistoryOf,
  priceHistory,
  roundKg,
  roundLitres,
  roundMoney,
  roundedCosts,
  herdShares,
  handedOverAt,
  startOfFarmDay,
  sidesOverTime,
  tripShares,
} from "@OpenFarm/domain";

import { THE_FARMS_PURSE } from "./money-store";
import { writtenOffByItem } from "./receivable-store";
import { movementsByItem } from "./stock-store";
import { tripCostOf } from "./trip-store";
import { ownersOverTime, whenEachCame } from "./venture-store";
import { insideATransaction, keptUntilAWrite } from "./writes-seen";

type Db = Pick<Database, "query" | "execute">;
type Side = PenHistoryLine["side"];

/** One dose given, charged to the animal who had it: what it cost, or null when it cannot be costed. */
interface DoseShare {
  animalId: string;
  side: Side;
  at: Date;
  /** Which medicine she was given, so a month's doses can be named rather than counted. */
  drugProductId: string;
  medicineMoney: number | null;
}

/** One animal's share of a Vet Fee for a visit that named her. */
interface VetShare {
  animalId: string;
  side: Side;
  at: Date;
  /** The fee it is a share of. */
  feeId: string;
  vetMoney: number;
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

/** A charge the costing gave out by the head — the Market toll, an outing, a Herd Cost — as a Charge of its kind. */
const byTheHead = (kind: Charge["kind"], one: CostShare): Charge => ({
  kind,
  animalId: one.animalId,
  side: one.side,
  at: one.at,
  amount: one.amount,
  fromId: one.fromId,
  unpricedKg: 0,
  priced: true,
  ...(one.over ? { over: one.over } : {}),
});

/**
 * Every share the costing gave out, as one list of Charges — the one place its kinds are walked, so a new kind is added
 * once and every sum that names it counts it (CONTEXT.md, Holding). A Selling Trip is told from a Buying Trip here,
 * since the Farm is owed one back and not the other.
 */
const chargesFrom = (
  shares: {
    feed: readonly FeedShare[];
    doses: readonly DoseShare[];
    vet: readonly VetShare[];
    marketToll: readonly CostShare[];
    trips: readonly CostShare[];
    brokers: readonly CostShare[];
    herd: readonly CostShare[];
  },
  sellingTrips: ReadonlyMap<string, string>
): Charge[] => [
  ...shares.feed.map((one): Charge => ({
    kind: "feed",
    animalId: one.animalId,
    side: one.side,
    at: one.at,
    amount: one.feedMoney,
    fromId: one.feedItemId,
    unpricedKg: one.unpricedKg,
    priced: one.unpricedKg === 0,
  })),
  ...shares.doses.map((one): Charge => ({
    kind: "dose",
    animalId: one.animalId,
    side: one.side,
    at: one.at,
    amount: one.medicineMoney ?? 0,
    fromId: one.drugProductId,
    unpricedKg: 0,
    priced: one.medicineMoney !== null,
  })),
  ...shares.vet.map((one): Charge => ({
    kind: "vet",
    animalId: one.animalId,
    side: one.side,
    at: one.at,
    amount: one.vetMoney,
    fromId: one.feeId,
    unpricedKg: 0,
    priced: true,
  })),
  ...shares.marketToll.map((one) => byTheHead("market_toll", one)),
  ...shares.trips.map((one) =>
    byTheHead(
      sellingTrips.has(one.fromId) ? "selling_trip" : "buying_trip",
      one
    )
  ),
  ...shares.brokers.map((one) => byTheHead("sale_broker", one)),
  ...shares.herd.map((one) => byTheHead("herd", one)),
];

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
  amount: number;
}): HerdCostToSplit | null =>
  money.side !== null && money.chargedToAnimals
    ? {
        at: money.at,
        side: money.side,
        amount: money.amount,
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
const workOutFarmCosts = async (db: Db, farmId: string) => {
  // Callers may hand this function a transaction. PostgreSQL gives that transaction one client, so these reads
  // must stay sequential even though a pool-backed call could run them concurrently.
  const loaded = await db.query.animal.findMany({
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
          purchasePriceMoney: true,
          marketTollMoney: true,
          buyingTripId: true,
          weightKg: true,
          arrivedAt: true,
        },
      },
      sale: {
        columns: {
          id: true,
          priceMoney: true,
          soldAt: true,
          weightKg: true,
          brokerMoney: true,
        },
      },
      // Her latest reading the farm did not doubt: a misweighing is no gain anybody paid for.
      weighIns: {
        where: { flaggedNote: { isNull: true } },
        columns: { weightKg: true },
        orderBy: { weighedAt: "desc", id: "desc" },
        limit: 1,
      },
    },
  });
  // What she fetched is her price less whatever of her buyer's Receivable stays written off — read here, once, so every sum
  // of what an animal fetched (her Margin, Return on Cost, a Season, the dairy herd's own) reads the same figure. A
  // Venture's animal never leaves owing, so nothing here can move a Venture's figures.
  const writtenOff = await writtenOffByItem(db, farmId);
  const animals = loaded.map((one) =>
    one.sale && writtenOff.has(one.sale.id)
      ? {
          ...one,
          sale: {
            ...one.sale,
            priceMoney: roundMoney(
              one.sale.priceMoney - (writtenOff.get(one.sale.id) ?? 0)
            ),
          },
        }
      : one
  );
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
      priceMoney: true,
      doses: true,
    },
  });
  const fees = await db.query.vetFee.findMany({
    where: { farmId },
    columns: { id: true, amountMoney: true, visitedOn: true },
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
      brokerMoney: true,
      transportMoney: true,
      keepMoney: true,
      wentOn: true,
    },
  });
  const sellingTrips = await db.query.sellingTrip.findMany({
    where: { farmId },
    columns: {
      id: true,
      transportMoney: true,
      keepMoney: true,
      wentOn: true,
      // Where it went, so a month's charges can name the outing rather than only total it.
      wentTo: true,
    },
  });
  // Its own outings' animals alone: the table carries no farm of its own, so it is asked by this farm's outings.
  const takenOnSellingTrips =
    sellingTrips.length === 0
      ? []
      : await db.query.sellingTripAnimal.findMany({
          where: {
            sellingTripId: { in: sellingTrips.map((one) => one.id) },
          },
        });
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
      amountMoney: true,
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
      priceMoney: one.priceMoney,
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
            medicineMoney: dosePriceOf(
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
              feeId: fee.id,
              vetMoney: fee.amountMoney / fee.animals.length,
            },
          ]
        : [];
    })
  );

  // The livestock market's toll on one beast, charged to her alone from the day she came off the lorry.
  const marketToll: CostShare[] = animals.flatMap((one) =>
    one.intake && one.intake.marketTollMoney > 0
      ? [
          {
            animalId: one.id,
            side: sideOf(one, one.intake.arrivedAt),
            at: one.intake.arrivedAt,
            fromId: one.intake.id,
            amount: one.intake.marketTollMoney,
          },
        ]
      : []
  );
  // The broker's fee on one Sale, charged to her alone on the day she was sold: hers as the Market toll is.
  const brokers: CostShare[] = animals.flatMap((one) =>
    one.sale && one.sale.brokerMoney > 0
      ? [
          {
            animalId: one.id,
            side: sideOf(one, one.sale.soldAt),
            at: one.sale.soldAt,
            fromId: one.sale.id,
            amount: one.sale.brokerMoney,
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
      costMoney: tripCostOf(one),
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

  // What the farm spent on the animals without naming any of them, by the days each stood here — cut between her
  // owners where an Internal Sale fell in the month, so each owner carries the days it held her.
  const owners = await ownersOverTime(db, farmId);
  const herdCosts = herdShares({
    owners,
    costs: enteredByHand.flatMap((one) => {
      const cost = herdCostOf({
        at: one.occurredAt,
        side: one.side,
        categoryId: one.categoryId,
        chargedToAnimals: one.category?.chargedToAnimals ?? false,
        amount: one.amountMoney,
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

  const sellingTripNames = new Map(
    sellingTrips.map((one) => [one.id, one.wentTo] as const)
  );
  const charges = chargesFrom(
    {
      feed: fed.shares,
      doses: dosed,
      vet: visited,
      marketToll,
      trips: outings.shares,
      brokers,
      herd,
    },
    sellingTripNames
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
    /** Every charge to every Animal: what every sum of what an Animal cost is picked from. */
    charges,
    /** Litres each cow sent to Bulk: not a charge, but read beside them for what a litre cost. */
    litres: milked,
    /**
     * Which outings were Selling Trips, and what each was called.
     *
     * The two kinds of outing are charged the same way and shown on one line, but they are paid for
     * quite differently: a Buying Trip comes out of the Buying Float, drawn before the lorry goes and
     * counted against it the same evening, while a Selling Trip happens long after that Float is shut.
     * So the monthly Reimbursement has to be able to tell them apart, and this is what tells it.
     */
    sellingTrips: sellingTripNames,
    ofAnimal: {
      charges: byAnimal(charges),
      litres: byAnimal(milked),
    },
  };
};

export type FarmCosts = Awaited<ReturnType<typeof workOutFarmCosts>>;

/**
 * The farm's costing (see `workOutFarmCosts`), kept until something is written: it is worked out from the whole
 * history, and the Owner's overview alone asks for it four times at once. A transaction works it out afresh.
 */
export const farmCosts = (db: Db, farmId: string): Promise<FarmCosts> =>
  insideATransaction(db)
    ? workOutFarmCosts(db, farmId)
    : keptUntilAWrite("costs", farmId, () => workOutFarmCosts(db, farmId));

/**
 * What was charged to one animal's keep, as the costing shares it out: her feed, her doses, her part of the Vet's fees
 * for visits that named her, and her part of the Herd Costs — a fattening Animal's Cost of Gain now and a dairy cow's
 * milk against her keep both read it, so the two keeps are one sum.
 */
export const keepChargesOf = (
  costs: FarmCosts,
  animalId: string
): KeepCharge[] =>
  (costs.ofAnimal.charges.get(animalId) ?? [])
    .filter((one) => HER_KEEP.has(one.kind))
    .map((one) => ({
      at: one.at,
      amount: one.amount,
      fed: one.kind === "feed",
      priced: one.priced,
      // Her part of a month's Herd Cost is read by its days, not by the day it was entered.
      ...(one.over ? { over: one.over } : {}),
    }));

/** The litres some cows sent to Bulk. */
const litresOf = (litres: readonly LitresShare[]): number =>
  litres.reduce((sum, one) => sum + one.litres, 0);

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
const lactationOf = (
  animal: FarmAnimal,
  hers: { charges: readonly Charge[]; litres: readonly LitresShare[] }
) => {
  const since = animal.lactationStartedAt;
  if (animal.side !== "dairy" || since === null) {
    return null;
  }
  const costs = costsOf(hers.charges.filter((one) => one.at >= since));
  const litresToBulk = litresOf(hers.litres.filter((one) => one.at >= since));
  return {
    since,
    ...roundedCosts(costs),
    litresToBulk: roundLitres(litresToBulk),
    costPerLitreMoney: costPerLitreOf(costs, litresToBulk),
  };
};

/**
 * One animal on the farm: what she has cost over her whole time here, what she was bought and sold for,
 * her Margin and what each kilogram she put on cost — and, for a cow in milk, what she has cost and sent
 * to Bulk in this Lactation, and so her Cost per Litre. Not over her whole life: a first-lactation cow's
 * calf and heifer years are not what her milk costs.
 */
export const economicsOfAnimal = (costs: FarmCosts, animal: FarmAnimal) => {
  const hers = {
    charges: costs.ofAnimal.charges.get(animal.id) ?? [],
    litres: costs.ofAnimal.litres.get(animal.id) ?? [],
  };
  const whole = costsOf(hers.charges);
  const purchaseMoney = animal.intake ? animal.intake.purchasePriceMoney : null;
  const saleMoney = animal.sale ? animal.sale.priceMoney : null;
  const gainKg = gainOf(animal);
  return {
    ...roundedCosts(whole),
    purchaseMoney,
    saleMoney,
    marginMoney: marginOf({ costs: whole, purchaseMoney, saleMoney }),
    gainKg,
    costOfGainMoney: costOfGainOf(whole, gainKg),
    lactation: lactationOf(animal, hers),
  };
};

/** Everything charged to one animal, as her own line shows it. */
export const chargedOf = (one: Costs) =>
  one.feedMoney +
  one.medicineMoney +
  one.vetMoney +
  one.marketTollMoney +
  one.tripMoney +
  one.herdMoney;

/**
 * What a Venture's cattle earned: each of them, and the herd together.
 *
 * A **Margin** is the Animal's own sum and not the owner's — `CONTEXT.md` says "the same sum for every
 * Animal, whoever owns her" — so this narrows the farm's costing to her animals rather than working
 * anything out a second way. A beast still standing has no Margin at all, because she has not earned
 * anything yet; she still has a **Cost of Gain**, because she has eaten and grown.
 *
 * The herd's Cost of Gain is everything charged to those weighed since they came over everything they put on, not
 * the mean of their rates. `theirProgress` made the same choice for daily gain and said why: averaging rates lets
 * a bull who arrived last week count for as much as one who has been here since January.
 *
 * Added from the figures as each line shows them, so the total is what the column comes to rather than
 * something a paisa away from it.
 */
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
  const chargedMoney = roundMoney(
    each.reduce((sum, one) => sum + chargedOf(one), 0)
  );
  // Cost of Gain over the animals whose gain is known: one nobody has weighed since he came put on kilos nobody knows,
  // and his feed set against none of them would read the herd's kilo dearer than it was. As a Season's growth does.
  const weighed = each.filter((one) => one.gainKg !== null);
  const gainKg = roundKg(
    weighed.reduce((sum, one) => sum + (one.gainKg ?? 0), 0)
  );
  const chargedForGain = weighed.reduce((sum, one) => sum + chargedOf(one), 0);
  const sold = each.filter((one) => one.marginMoney !== null);
  return {
    // Worst first: the question is which bull did not earn, and he is the one worth finding. A beast
    // with no Margin yet is not the worst of them — she is not in the running — so she follows.
    animals: each.toSorted((a, b) => {
      if (a.marginMoney === null || b.marginMoney === null) {
        return Number(a.marginMoney === null) - Number(b.marginMoney === null);
      }
      return a.marginMoney - b.marginMoney;
    }),
    soldCount: sold.length,
    /** Everyone else: those still standing, and any that died. Neither has earned a Margin. */
    unsoldCount: each.length - sold.length,
    chargedMoney,
    gainKg,
    marginMoney:
      sold.length === 0
        ? null
        : roundMoney(
            sold.reduce((sum, one) => sum + (one.marginMoney ?? 0), 0)
          ),
    costOfGainMoney: gainKg > 0 ? roundMoney(chargedForGain / gainKg) : null,
  };
};

/**
 * The costing narrowed to each of several stretches at once: its charges and litres in each, every one read once. A
 * report of thirteen stretches asked of the whole would read a year's million charges thirteen times; asked of these,
 * each stretch reads its own. Everything else — the animals, each one's own charges — is the whole costing's, as
 * `costsBySide` needs it.
 */
export const narrowedToEach = (
  costs: FarmCosts,
  ranges: readonly { from: Date; until: Date }[]
): FarmCosts[] => {
  // Plain loops over moments as numbers: a million charges a year, each asked of every stretch.
  const slots = ranges.map((range) => ({
    from: range.from.getTime(),
    until: range.until.getTime(),
    charges: [] as FarmCosts["charges"][number][],
    litres: [] as FarmCosts["litres"][number][],
  }));
  for (const one of costs.charges) {
    const at = one.at.getTime();
    for (const slot of slots) {
      if (at >= slot.from && at < slot.until) {
        slot.charges.push(one);
      }
    }
  }
  for (const one of costs.litres) {
    const at = one.at.getTime();
    for (const slot of slots) {
      if (at >= slot.from && at < slot.until) {
        slot.litres.push(one);
      }
    }
  }
  return slots.map(({ charges, litres }) => ({ ...costs, charges, litres }));
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
  const onSide = (side: Side) => {
    const here = (share: { side: Side; at: Date }) =>
      share.side === side && inThePeriod(share.at);
    return {
      costs: costsOf(costs.charges.filter(here)),
      litresToBulk: litresOf(costs.litres.filter(here)),
    };
  };
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
      costPerLitreMoney: costPerLitreOf(dairy.costs, dairy.litresToBulk),
    },
    fattening: roundedCosts(fattening.costs),
    soldFattening: {
      animals: sold.map(
        ({ tagNumber, purchaseMoney, saleMoney, marginMoney }) => ({
          tagNumber,
          purchaseMoney,
          saleMoney,
          marginMoney,
        })
      ),
      marginMoney: roundMoney(
        sold.reduce((sum, one) => sum + (one.marginMoney ?? 0), 0)
      ),
    },
    unallocated: {
      feedMoney: roundMoney(
        unallocated.reduce((sum, one) => sum + one.feedMoney, 0)
      ),
      unpricedKg: roundKg(
        unallocated.reduce((sum, one) => sum + one.unpricedKg, 0)
      ),
      tripMoney: roundMoney(
        strayTrips.reduce((sum, one) => sum + one.amount, 0)
      ),
      herdMoney: roundMoney(
        strayHerd.reduce((sum, one) => sum + one.amount, 0)
      ),
    },
  };
};

/** What each thing charged came to, added up by the thing it was. */
const groupedLines = (charges: readonly Charge[]): ConsumedLine[] => {
  const byId = new Map<string, number>();
  for (const one of charges) {
    byId.set(one.fromId, (byId.get(one.fromId) ?? 0) + one.amount);
  }
  return [...byId]
    .map(([id, amount]) => ({ id, amount: roundMoney(amount) }))
    .filter((line) => line.amount > 0);
};

/** The last Internal Sale that put each animal where she is, by its price and the moment it handed her over
 *  (handedOverAt): what her owner now paid for her, and from when. */
export const boughtInOf = async (
  db: Pick<Database, "query">,
  farmId: string
): Promise<
  Map<
    string,
    { toVentureId: string | null; priceMoney: number; handedOver: Date }
  >
> => {
  const [sales, came] = await Promise.all([
    db.query.internalSale.findMany({
      where: { farmId },
      columns: {
        animalId: true,
        toVentureId: true,
        priceMoney: true,
        soldOn: true,
      },
      orderBy: { soldOn: "asc", id: "asc" },
    }),
    whenEachCame(db, farmId),
  ]);
  return new Map(
    sales.map((one) => [
      one.animalId,
      {
        toVentureId: one.toVentureId,
        priceMoney: one.priceMoney,
        handedOver: handedOverAt(one.soldOn, came.get(one.animalId)),
      },
    ])
  );
};

/**
 * When an owner — a Venture, or the Farm — took an animal on, and at what: by an Internal Sale, from that day at that
 * price; else, where the owner's own buying brought her in, from the day she came off the lorry at her price; else, for
 * the Farm, one bred or crossed here, from the start at nothing paid. Nothing for an owner who never paid for her.
 */
const takenOnBy = (
  animal: Pick<FarmAnimal, "id" | "intake">,
  owner: string | null,
  ownedThenBy: OwnedThenBy,
  boughtIn: { priceMoney: number; handedOver: Date } | undefined
): { at: Date; priceMoney: number } | null => {
  if (boughtIn) {
    return { at: boughtIn.handedOver, priceMoney: boughtIn.priceMoney };
  }
  if (animal.intake) {
    return ownedThenBy(animal.id, animal.intake.arrivedAt) === owner
      ? {
          at: animal.intake.arrivedAt,
          priceMoney: animal.intake.purchasePriceMoney,
        }
      : null;
  }
  return owner === null ? { at: new Date(0), priceMoney: 0 } : null;
};

/**
 * What an animal has cost one owner to date, to the taka: what they paid to take her on, and every charge on her since,
 * while she was theirs — as that owner's Settlement or books count her. Never her life before they had her, which was
 * somebody else's cost. Nothing for an owner who never paid for her.
 */
export const costToItsOwner = (
  costs: Pick<FarmCosts, "charges">,
  ownedThenBy: OwnedThenBy,
  animal: Pick<FarmAnimal, "id" | "intake">,
  owner: string | null,
  /** The Internal Sale that last brought her to this owner, where one did. */
  boughtIn?: { priceMoney: number; handedOver: Date }
): number | null => {
  const takenOn = takenOnBy(animal, owner, ownedThenBy, boughtIn);
  if (!takenOn) {
    return null;
  }
  const charged = chargesOfOwner(
    costs.charges.filter(
      (one) => one.animalId === animal.id && one.at >= takenOn.at
    ),
    owner,
    ownedThenBy
  ).reduce((sum, one) => sum + one.amount, 0);
  return roundMoney(takenOn.priceMoney + charged);
};

/**
 * The costing narrowed to what was the Farm's own at the time: each share of an Animal the Farm owned that day, and
 * each Animal the Farm owned when she was sold. A Venture's Animals, their charges and their Margins are its own and
 * its Settlement's; read as the Farm's as well, the same bull would be counted twice. Never a second sum — the same
 * charges, picked by whose she was that day, as a Venture's are for its Settlement. An animal the Farm bought back from
 * a Venture is at the price the Farm paid for her, not at what her first buyer did: her Margin is the Farm's own.
 */
export const theFarmsOwn = (
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  /** The Internal Sale that last put each animal where she is (`boughtInOf`); left out, every price is her first. */
  boughtIn: ReadonlyMap<
    string,
    { toVentureId: string | null; priceMoney: number; handedOver: Date }
  > = new Map()
): FarmCosts => {
  // An animal the Farm bought back is the Farm's from the buy-back, at its price: what she was charged in its first
  // stretch with her was recovered by the Internal Sale that took her off it, and counted again it took her margin twice.
  const sinceBoughtBack = (one: { animalId: string; at: Date }) => {
    const back = boughtIn.get(one.animalId);
    return !(back && back.toVentureId === null && one.at < back.handedOver);
  };
  const charges = chargesOfOwner(costs.charges, null, ownedThenBy).filter(
    sinceBoughtBack
  );
  const litres = costs.litres.filter(
    (one) => ownedThenBy(one.animalId, one.at) === null
  );
  const atTheFarmsPrice = (one: FarmAnimal): FarmAnimal => {
    const back = boughtIn.get(one.id);
    return back && back.toVentureId === null && one.intake
      ? {
          ...one,
          intake: { ...one.intake, purchasePriceMoney: back.priceMoney },
        }
      : one;
  };
  return {
    ...costs,
    animals: costs.animals
      .filter(
        (one) => !one.sale || ownedThenBy(one.id, one.sale.soldAt) === null
      )
      .map(atTheFarmsPrice),
    charges,
    litres,
    ofAnimal: {
      charges: byAnimal(charges),
      litres: byAnimal(litres),
    },
  };
};

/**
 * Everything a Venture's Animals were charged over the whole run, whoever paid it.
 *
 * The same costing narrowed to the Animals that were this Venture's at the time — its Market toll and its
 * Trips too, which `consumedBy` leaves out because a Reimbursement is only about what the Farm bought and
 * is owed back. A Settlement is a different question: what did this run cost, whichever purse the taka
 * came out of. Never a second sum — the same shares, filtered.
 */
export const chargedTo = (
  costs: FarmCosts,
  ownedThenBy: OwnedThenBy,
  ventureId: string
) =>
  roundedCosts(costsOf(chargesOfOwner(costs.charges, ventureId, ownedThenBy)));

/** One line of what a month's consumption was made of: what it was, and what it came to. */
export interface ConsumedLine {
  id: string;
  amount: number;
}

/**
 * What one owner's Animals consumed in a period, and what it was made of.
 *
 * Only what the Farm bought for the whole herd and is owed back: feed, medicine and the vet, and the
 * Animals' share of the month's Herd Costs, and the Selling Trips that carried them and the brokers at their Sales.
 *
 * Not the Market toll and not a Buying Trip: those came out of the Venture's own Buying Float, drawn before
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
  const theirs = chargesOfOwner(
    costs.charges,
    ventureId,
    ownedThenBy,
    WHAT_THE_FARM_IS_OWED
  ).filter((one) => one.at >= from && one.at < until);
  const summed = costsOf(theirs);
  const feedMoney = roundMoney(summed.feedMoney);
  const medicineMoney = roundMoney(summed.medicineMoney);
  const vetMoney = roundMoney(summed.vetMoney);
  const herdMoney = roundMoney(summed.herdMoney);
  // Only the outings the Farm paid for: what the Farm is owed leaves the Buying Trips behind.
  const tripsMoney = roundMoney(summed.tripMoney);
  const ofKind = (kind: Charge["kind"]) =>
    theirs.filter((one) => one.kind === kind);
  return {
    feedMoney,
    medicineMoney,
    vetMoney,
    herdMoney,
    tripsMoney,
    // The sum of the parts as they are shown, not of the parts before they were rounded: five lines
    // that do not add up to the figure beneath them is the farm arguing with itself in front of an
    // Investor.
    totalMoney: roundMoney(
      feedMoney + medicineMoney + vetMoney + herdMoney + tripsMoney
    ),
    /** Kilos fed that nothing can price, and doses nothing can cost: the figure is short by them until they are. */
    unpricedKg: summed.unpricedKg,
    uncostedDoses: summed.uncostedDoses,
    /** What it was made of, so the Owner can read it to an Investor: which Feed Items, which
     *  medicines, which Categories of Herd Cost, and what each came to. */
    madeOf: {
      feed: groupedLines(ofKind("feed")),
      medicine: groupedLines(ofKind("dose")),
      herd: groupedLines(ofKind("herd")),
      /** Which outings, so the line reads "the livestock market at Gabtoli" rather than an id — and the broker at each Sale, by
       *  the Sale, so the lines add up to the trips' figure. */
      trips: groupedLines([
        ...ofKind("selling_trip"),
        ...ofKind("sale_broker"),
      ]),
    },
  };
};

/** One earlier month a Reimbursement carried, and by how much — less where it came to less than was paid. */
export interface CarriedLine {
  month: string;
  amount: number;
}

/** A month's Reimbursement as its Venture Movement keeps it. */
export interface Reimbursed {
  forMonth: string | null;
  amountMoney: number;
  carried: readonly CarriedLine[] | null;
}

/**
 * What a Venture owes the Farm, month by month: what each month its Animals ran comes to now, what has been paid
 * for it — its own Reimbursement's figure (its amount less what it carried) and every line carried for it since —
 * and the difference. A cost landing in a month already repaid, or a Correction moving one, shows here as that
 * month's difference, which the next Reimbursement carries; a month never repaid owes all of it.
 */
export const owedByMonth = (
  costs: FarmCosts,
  ownedThenBy: (animalId: string, at: Date) => string | null,
  ventureId: string,
  months: readonly string[],
  paid: readonly Reimbursed[]
) => {
  // The Venture's own charges picked out of the farm's once, not once a month: whose an animal was is asked of every
  // charge, and a year on there are a million.
  const theirs: FarmCosts = {
    ...costs,
    charges: chargesOfOwner(
      costs.charges,
      ventureId,
      ownedThenBy,
      WHAT_THE_FARM_IS_OWED
    ),
  };
  return months.map((month) => {
    const consumed = consumedBy(
      theirs,
      ownedThenBy,
      ventureId,
      monthOf(startOfFarmDay(`${month}-01`))
    );
    const comesToMoney = consumed.totalMoney;
    const own = paid.find((one) => one.forMonth === month);
    const ownFigureMoney = own
      ? own.amountMoney -
        (own.carried ?? []).reduce((sum, line) => sum + line.amount, 0)
      : 0;
    const carriedForMoney = paid
      .flatMap((one) => one.carried ?? [])
      .filter((line) => line.month === month)
      .reduce((sum, line) => sum + line.amount, 0);
    const paidMoney = roundMoney(ownFigureMoney + carriedForMoney);
    return {
      month,
      comesToMoney,
      /** Whether the month has had a Reimbursement of its own. */
      repaid: own !== undefined,
      paidMoney,
      stillOwedMoney: roundMoney(comesToMoney - paidMoney),
      unpricedKg: consumed.unpricedKg,
      uncostedDoses: consumed.uncostedDoses,
    };
  });
};
