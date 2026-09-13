import type { Database } from "@OpenFarm/db";
import type { FeedShare, Stay } from "@OpenFarm/domain";
import {
  EXIT_STATES,
  dosePriceOf,
  economicsOf,
  feedShares,
  priceHistory,
  staysOf,
} from "@OpenFarm/domain";

import { movementsByItem } from "./stock-store";

type Db = Pick<Database, "query" | "execute">;
type Side = Stay["side"];

/** One dose given, charged to the animal who had it: what it cost, or null when it cannot be costed. */
interface DoseShare {
  animalId: string;
  side: Side;
  at: Date;
  medicineBdt: number | null;
}

/** Litres one animal sent to Bulk in one Milking Session. */
interface LitresShare {
  animalId: string;
  side: Side;
  at: Date;
  litres: number;
}

/** The Side an animal was on at a moment: the stay she was in then, or where she stands now. */
const sideAt = (
  stays: readonly Stay[],
  animal: { id: string; side: Side },
  at: Date
): Side =>
  stays.find(
    (stay) =>
      stay.animalId === animal.id &&
      stay.from <= at &&
      (stay.until === null || at < stay.until)
  )?.side ?? animal.side;

/**
 * Everything the farm's costs are worked out from, charged to its animals: every Feeding split across the
 * animals standing in its Pen, every dose charged to the animal who had it, and every litre each cow sent
 * to Bulk. Worked out afresh, never stored, so a corrected Feeding or a Purchase written up late moves it
 * without anybody having to remember to.
 *
 * The whole farm's history at once: a margin is a whole life's costs, and a Pen's split needs everybody
 * who stood in it.
 */
export const farmCosts = async (db: Db, farmId: string) => {
  const [animals, moves, feedings, movements, doses, purchases, sessions] =
    await Promise.all([
      db.query.animal.findMany({
        where: { farmId },
        columns: {
          id: true,
          tagNumber: true,
          side: true,
          state: true,
          stateChangedAt: true,
        },
        with: {
          intake: { columns: { purchasePriceBdt: true } },
          sale: { columns: { priceBdt: true, soldAt: true } },
        },
      }),
      db.query.animalMove.findMany({
        where: { farmId },
        columns: { animalId: true, toPenId: true, toSide: true, movedAt: true },
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
          drugProductId: true,
          purchasedOn: true,
          priceBdt: true,
          doses: true,
        },
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
    ]);

  const exits: readonly string[] = EXIT_STATES;
  const leftAt = new Map(
    animals
      .filter((one) => exits.includes(one.state))
      .map((one) => [one.id, one.stateChangedAt] as const)
  );
  const stays = staysOf(moves, leftAt);
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
      lines: (one.lines as { feedItemId: string; givenKg: number }[]).map(
        (line) => ({
          feedItemId: line.feedItemId,
          givenKg: Number(line.givenKg),
        })
      ),
    })),
    stays,
    priceOf,
  });

  const purchasesOf = new Map<
    string,
    { purchasedOn: Date; priceBdt: number; doses: number }[]
  >();
  for (const one of purchases) {
    const list = purchasesOf.get(one.drugProductId) ?? [];
    list.push({
      purchasedOn: one.purchasedOn,
      priceBdt: Number(one.priceBdt),
      doses: one.doses,
    });
    purchasesOf.set(one.drugProductId, list);
  }
  const dosed: DoseShare[] = doses.flatMap((one) => {
    const animal = byId.get(one.animalId);
    if (!(animal && one.givenAt)) {
      return [];
    }
    return [
      {
        animalId: one.animalId,
        side: sideAt(stays, animal, one.givenAt),
        at: one.givenAt,
        medicineBdt: dosePriceOf(
          purchasesOf.get(one.productId) ?? [],
          one.givenAt
        ),
      },
    ];
  });

  const milked: LitresShare[] = sessions.flatMap((session) =>
    session.records.flatMap((record) => {
      const animal = byId.get(record.animalId);
      return animal
        ? [
            {
              animalId: record.animalId,
              side: sideAt(stays, animal, session.dueAt),
              at: session.dueAt,
              litres: Number(record.litres),
            },
          ]
        : [];
    })
  );

  return {
    animals,
    feed: fed.shares,
    unallocatedFeedBdt: fed.unallocatedBdt,
    doses: dosed,
    litres: milked,
  };
};

type FarmCosts = Awaited<ReturnType<typeof farmCosts>>;

/** Feed, medicine and litres added up over a set of shares. */
const totalsOf = (
  feed: readonly FeedShare[],
  doses: readonly DoseShare[],
  litres: readonly LitresShare[]
) => ({
  feedBdt: feed.reduce((sum, one) => sum + one.feedBdt, 0),
  unpricedKg: feed.reduce((sum, one) => sum + one.unpricedKg, 0),
  medicineBdt: doses.reduce((sum, one) => sum + (one.medicineBdt ?? 0), 0),
  uncostedDoses: doses.filter((one) => one.medicineBdt === null).length,
  litresToBulk: litres.reduce((sum, one) => sum + one.litres, 0),
});

/** One animal's whole life on the farm: what she cost, what she fetched, and what a litre of hers cost. */
export const economicsOfAnimal = (costs: FarmCosts, animalId: string) => {
  const animal = costs.animals.find((one) => one.id === animalId);
  const hers = <T extends { animalId: string }>(shares: readonly T[]) =>
    shares.filter((one) => one.animalId === animalId);
  return economicsOf({
    ...totalsOf(hers(costs.feed), hers(costs.doses), hers(costs.litres)),
    purchaseBdt: animal?.intake ? Number(animal.intake.purchasePriceBdt) : null,
    saleBdt: animal?.sale ? Number(animal.sale.priceBdt) : null,
  });
};

/**
 * A period added up by Side: what each Side's animals were fed and dosed in it, the litres the dairy sent
 * to Bulk and what a litre cost, and the fattening animals sold in it with each one's whole-life margin.
 */
export const costsBySide = (
  costs: FarmCosts,
  { from, until }: { from: Date; until: Date }
) => {
  const within = <T extends { at: Date; side: Side }>(
    shares: readonly T[],
    side: Side
  ) =>
    shares.filter(
      (one) => one.side === side && one.at >= from && one.at < until
    );
  const sideTotals = (side: Side) => {
    const totals = totalsOf(
      within(costs.feed, side),
      within(costs.doses, side),
      within(costs.litres, side)
    );
    return economicsOf({ ...totals, purchaseBdt: null, saleBdt: null });
  };
  const sold = costs.animals
    .filter(
      (one) =>
        one.side === "fattening" &&
        one.sale !== null &&
        one.sale.soldAt >= from &&
        one.sale.soldAt < until
    )
    .map((one) => ({
      tagNumber: one.tagNumber,
      ...economicsOfAnimal(costs, one.id),
    }))
    .toSorted((a, b) => a.tagNumber.localeCompare(b.tagNumber));
  const {
    marginBdt: _none,
    costPerLitreBdt: _noLitres,
    ...fattening
  } = sideTotals("fattening");
  const { marginBdt: _noMargin, ...dairy } = sideTotals("dairy");
  return {
    dairy,
    fattening: {
      ...fattening,
      sold,
      marginBdt: sold.reduce((sum, one) => sum + (one.marginBdt ?? 0), 0),
    },
    unallocatedFeedBdt: costs.unallocatedFeedBdt,
  };
};
