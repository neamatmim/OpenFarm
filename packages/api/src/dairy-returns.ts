import type { Database } from "@OpenFarm/db";
import type { HeadPriceKind } from "@OpenFarm/db/schema/returns";
import { HEAD_PRICE_KINDS } from "@OpenFarm/db/schema/returns";
import type { DairyBooks, HeadRange } from "@OpenFarm/domain";
import {
  dairyRunOf,
  farmDayOf,
  herdNowOf,
  milkPricesByMonth,
} from "@OpenFarm/domain";

import { fetchedPerLitre, writtenOffByItem } from "./receivable-store";

/**
 * What the dairy herd returns, read for the domain's `dairy-returns` to work: every Animal who has stood on the Dairy
 * side, the months' milk prices off the Dispatches, and the Head Prices. Every rule a dairy run follows is there, and
 * tested there; what is here is only read, and laid out for the page.
 */

/** Every Animal who has stood on the Dairy side: there now, or walked across from it to Fattening. */
export const EVER_ON_THE_DAIRY_SIDE = {
  OR: [{ side: "dairy" as const }, { joinings: { how: "crossed" as const } }],
};

/** What a litre fetched each month the farm sent milk away, off every Dispatch. */
const monthlyMilkPrices = async (db: Database, farmId: string) => {
  const rows = await db.query.dispatch.findMany({
    where: { farmId },
    columns: {
      id: true,
      dispatchedAt: true,
      litres: true,
      pricePerLitreMoney: true,
    },
  });
  // Milk a buyer never paid for, and the Owner wrote off, did not fetch its price.
  const writtenOff = await writtenOffByItem(db, farmId);
  return milkPricesByMonth(
    rows.map((one) => ({
      dispatchedAt: one.dispatchedAt,
      litres: Number(one.litres),
      pricePerLitreMoney: fetchedPerLitre(one, writtenOff),
    }))
  );
};

/** Every dairy Animal the farm has had, with what her run needs to know of her. */
const dairyAnimalsOf = async (db: Database, farmId: string) =>
  await db.query.animal.findMany({
    where: { farmId, ...EVER_ON_THE_DAIRY_SIDE },
    columns: {
      id: true,
      tagNumber: true,
      state: true,
      source: true,
      damId: true,
      birthDate: true,
      createdAt: true,
    },
    with: {
      entryPrice: { columns: { priceMoney: true, asOf: true } },
    },
    orderBy: { tagNumber: "asc", id: "asc" },
  });

/** Every dairy Animal's run, the farm's milk prices and Head Prices read once. */
const dairyRunsOf = async (
  db: Database,
  farmId: string,
  books: DairyBooks,
  floorDays: number,
  now: Date
) => {
  const animals = await dairyAnimalsOf(db, farmId);
  const milkPrices = await monthlyMilkPrices(db, farmId);
  const heads = await db.query.headPrice.findMany({
    where: { farmId },
    columns: { kind: true, lowMoney: true, highMoney: true },
  });
  const headPrices = new Map<string, HeadRange>(
    heads.map((one) => [
      one.kind,
      { lowMoney: one.lowMoney, highMoney: one.highMoney },
    ])
  );
  const worked = animals.map((her) =>
    dairyRunOf(books, her, milkPrices, headPrices, floorDays, now)
  );
  return {
    animals,
    heads,
    runs: worked.map((one) => one.run),
    spentOf: new Map(worked.map((one) => [one.run.animalId, one.spent])),
  };
};

/** The dairy runs the Returns page shows: the herd now, each gone with her calves, the Head Prices, and whom to price. */
export const dairyOf = async (
  db: Database,
  farmId: string,
  books: DairyBooks,
  floorDays: number,
  now: Date
) => {
  const { runs, heads, animals, spentOf } = await dairyRunsOf(
    db,
    farmId,
    books,
    floorDays,
    now
  );
  const calvesOf = (animalId: string) =>
    runs.filter((one) => one.damId === animalId);
  const standing = runs.filter((one) => one.left === null);
  const written = new Map(animals.map((one) => [one.id, one.createdAt]));
  return {
    herdNow: herdNowOf(standing, spentOf),
    /** Each dairy Animal still here, for the Cull list to set her return so far beside her reasons. */
    standing,
    gone: runs
      .filter((one) => one.left !== null)
      .toSorted(
        (a, b) =>
          (b.left?.on.getTime() ?? 0) - (a.left?.on.getTime() ?? 0) ||
          a.tagNumber.localeCompare(b.tagNumber)
      )
      .map((one) => ({ ...one, calves: calvesOf(one.animalId) })),
    headPrices: HEAD_PRICE_KINDS.map((kind: HeadPriceKind) => {
      const set = heads.find((one) => one.kind === kind);
      return {
        kind,
        lowMoney: set?.lowMoney ?? null,
        highMoney: set?.highMoney ?? null,
      };
    }),
    /** Every dairy Animal the Owner has yet to price: bought, or here before the books, with the day she was written
     *  down on the farm's books, which her price counts from unless the Owner says. */
    toPrice: runs
      .filter((one) => one.came === "unpriced")
      .map((one) => ({
        animalId: one.animalId,
        tagNumber: one.tagNumber,
        state: one.state,
        onTheBooksFrom: farmDayOf(written.get(one.animalId) ?? now),
      })),
  };
};

/** One dairy Animal's run and her calves', for her own page; nothing for one never on the Dairy side. */
export const dairyAnimalOf = async (
  db: Database,
  farmId: string,
  books: DairyBooks,
  animalId: string,
  floorDays: number,
  now: Date
) => {
  const { runs, animals } = await dairyRunsOf(
    db,
    farmId,
    books,
    floorDays,
    now
  );
  const run = runs.find((one) => one.animalId === animalId);
  const written = animals.find((one) => one.id === animalId)?.createdAt;
  return run
    ? {
        run,
        calves: runs.filter((one) => one.damId === animalId),
        /** The day she was written down on the farm's books, which her price counts from unless the Owner says — as
         *  the Returns page's list offers it. */
        onTheBooksFrom: farmDayOf(written ?? now),
      }
    : null;
};
