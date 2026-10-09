import type { Database } from "@OpenFarm/db";
import type { CapitalAnimal, OwnedThenBy } from "@OpenFarm/domain";
import { bredHere, chargesOfOwner, covers, roundMoney } from "@OpenFarm/domain";

import type { FarmCosts } from "./cost-store";
import { boughtInOf, farmCosts, takenOnBy } from "./cost-store";
import { THE_FARMS_PURSE } from "./money-store";
import { ownedThenByOf } from "./venture-store";

/** The States only a cow who has calved is in. */
const CALVED_STATES: ReadonlySet<string> = new Set(["milking", "dry"]);

/** What the Farm's capital at any moment is worked from, read once for a report however many moments it asks of it. */
export interface CapitalBooks {
  costs: FarmCosts;
  ownedThenBy: OwnedThenBy;
  boughtIn: Awaited<ReturnType<typeof boughtInOf>>;
  /** The price the Owner entered for a dairy animal bought, or here before the books. */
  entryPrice: ReadonlyMap<string, number>;
  /** Born to a dam the farm wrote down: taken on at nothing. */
  bornHere: ReadonlySet<string>;
  /** When each cow first calved; the start of time for one who calved before her books began. */
  firstCalved: ReadonlyMap<string, Date>;
  /** The Farm's own capital into each Venture and back from it, signed, each when it moved. */
  ventureCapital: readonly { ventureId: string; at: Date; amount: number }[];
  /** When each settled Venture's Settlement was approved: from then its capital is home, or lost. */
  settledAt: ReadonlyMap<string, Date>;
}

/** Everything the Farm's Capital Employed at any moment is read from (`capitalAt`). */
export const capitalBooksOf = async (
  db: Database,
  farmId: string
): Promise<CapitalBooks> => {
  const [
    costs,
    ownedThenBy,
    boughtIn,
    prices,
    animals,
    calvings,
    capital,
    settlements,
  ] = await Promise.all([
    farmCosts(db, farmId),
    ownedThenByOf(db, farmId),
    boughtInOf(db, farmId),
    db.query.dairyEntryPrice.findMany({
      where: { farmId },
      columns: { animalId: true, priceMoney: true },
    }),
    db.query.animal.findMany({
      where: { farmId },
      columns: {
        id: true,
        source: true,
        damId: true,
        state: true,
        lactationNumber: true,
      },
    }),
    db.query.calving.findMany({
      where: { farmId },
      columns: { damId: true, calvedAt: true },
      orderBy: { calvedAt: "asc", id: "asc" },
    }),
    db.query.moneyEvent.findMany({
      where: {
        farmId,
        purseVentureId: THE_FARMS_PURSE,
        source: { in: ["venture_capital_out", "venture_capital_back"] },
      },
      columns: {
        source: true,
        sourceId: true,
        amountMoney: true,
        occurredAt: true,
      },
    }),
    db.query.ventureSettlement.findMany({
      where: { farmId },
      columns: { ventureId: true, approvedAt: true },
    }),
  ]);
  const movements =
    capital.length === 0
      ? []
      : await db.query.ventureMovement.findMany({
          where: { farmId, id: { in: capital.map((one) => one.sourceId) } },
          columns: { id: true, ventureId: true },
        });
  const ventureOf = new Map(movements.map((one) => [one.id, one.ventureId]));
  const firstCalved = new Map<string, Date>();
  for (const one of calvings) {
    if (!firstCalved.has(one.damId)) {
      firstCalved.set(one.damId, one.calvedAt);
    }
  }
  // A cow in milk or dry with no calving written here calved before her books began — the opening register's, one
  // bought in milk — so none of her keep here is capital. One registered dry who calves here later still counts her
  // dry weeks: nothing kept says she had calved before.
  for (const one of animals) {
    if (
      !firstCalved.has(one.id) &&
      (one.lactationNumber > 0 || CALVED_STATES.has(one.state))
    ) {
      firstCalved.set(one.id, new Date(0));
    }
  }
  return {
    costs,
    ownedThenBy,
    boughtIn,
    entryPrice: new Map(prices.map((one) => [one.animalId, one.priceMoney])),
    bornHere: new Set(
      animals.filter((one) => bredHere(one)).map((one) => one.id)
    ),
    firstCalved,
    ventureCapital: capital.flatMap((one) => {
      const ventureId = ventureOf.get(one.sourceId);
      return ventureId
        ? [
            {
              ventureId,
              at: one.occurredAt,
              amount:
                one.source === "venture_capital_out"
                  ? one.amountMoney
                  : -one.amountMoney,
            },
          ]
        : [];
    }),
    settledAt: new Map(
      settlements.flatMap((one) =>
        one.approvedAt ? [[one.ventureId, one.approvedAt] as const] : []
      )
    ),
  };
};

/**
 * The Farm's own Animals standing at a moment, as their cost at it is read (CONTEXT.md: **Capital Employed**): what it
 * took the Farm to take each on — her price, the Internal Sale's that brought her back, the Owner's entry price for a
 * dairy animal bought or here before the books, nothing for one born here, no price for one never priced — and the
 * Farm's own charges on her from then to the moment.
 */
export const animalsAt = (books: CapitalBooks, at: Date): CapitalAnimal[] => {
  const { costs, ownedThenBy } = books;
  const standing = new Set(
    costs.history
      .filter((line) => covers(line, at))
      .map((line) => line.animalId)
  );
  return costs.animals.flatMap((animal) => {
    if (!standing.has(animal.id) || ownedThenBy(animal.id, at) !== null) {
      return [];
    }
    const back = books.boughtIn.get(animal.id);
    const boughtBack =
      back && back.toVentureId === null && back.handedOver <= at
        ? back
        : undefined;
    const takenOn = takenOnBy(animal, null, ownedThenBy, boughtBack);
    if (!takenOn) {
      return [];
    }
    const priced = Boolean(animal.intake || boughtBack);
    const entered = books.entryPrice.get(animal.id);
    let takenOnMoney: number | null = takenOn.priceMoney;
    if (!priced) {
      takenOnMoney = entered ?? (books.bornHere.has(animal.id) ? 0 : null);
    }
    return [
      {
        side: costs.sideOf(animal, at),
        takenOnMoney,
        charges: chargesOfOwner(
          costs.charges.filter(
            (one) =>
              one.animalId === animal.id && one.at >= takenOn.at && one.at < at
          ),
          null,
          ownedThenBy
        ).map((one) => ({ at: one.at, amount: one.amount })),
        firstCalvedAt: books.firstCalved.get(animal.id) ?? null,
      },
    ];
  });
};

/** The Farm Capital still out in Ventures at a moment: in less back, for every Venture not settled by then. */
export const venturesCapitalAt = (books: CapitalBooks, at: Date): number =>
  roundMoney(
    books.ventureCapital
      .filter((one) => {
        const settled = books.settledAt.get(one.ventureId);
        return one.at < at && !(settled && settled <= at);
      })
      .reduce((sum, one) => sum + one.amount, 0)
  );
