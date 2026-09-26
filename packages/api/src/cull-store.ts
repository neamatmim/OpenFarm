import type { Database } from "@OpenFarm/db";
import {
  cullReasonsOf,
  daysInMilk,
  groupedBy,
  keptOver,
  litresOver,
  milkAgainstKeep,
  milkPriceOf,
} from "@OpenFarm/domain";

import { repeatBreedersOn } from "./breeding-store";
import { farmCosts, keepChargesOf } from "./cost-store";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The cows a Cull Reason can be about: every one in milk or dry, and a heifer only as a Repeat Breeder. */
const BREEDING_STATES = [
  "heifer",
  "pregnant_heifer",
  "milking",
  "dry",
] as const;

/**
 * Every dairy cow in milk or dry, and every Repeat Breeder, with the reasons the farm has to name her to the Owner —
 * her milk against her keep over the days the farm reads a keep over, how long since she calved and whether she is in
 * calf, and how many heats she has been served on that did not take — whether or not any of them names her, so the
 * Owner can read a cow that pays beside one that does not.
 *
 * The same keep a fattening Animal's Cost of Gain now reads, and the same Repeat Breeder the Manager's queue asks
 * about, so no cow is named on a sum or a flag the farm says differently anywhere else.
 */
export const cullList = async (
  db: Database,
  farm: {
    id: string;
    repeatBreederThreshold: number;
    keepReadDays: number;
    cullOpenDays: number;
    cullMilkAfterDays: number;
    cullMilkPriceDays: number;
  },
  now: Date
) => {
  const costs = await farmCosts(db, farm.id);
  const cows = await db.query.animal.findMany({
    where: {
      farmId: farm.id,
      sex: "female",
      side: "dairy",
      state: { in: [...BREEDING_STATES] },
    },
    orderBy: { tagNumber: "asc" },
    columns: {
      id: true,
      tagNumber: true,
      state: true,
      lactationNumber: true,
      lactationStartedAt: true,
      expectedCalvingAt: true,
    },
    with: { pen: { columns: { name: true } } },
  });
  const unsettled = await repeatBreedersOn(
    db,
    farm.id,
    farm.repeatBreederThreshold
  );
  const repeat = new Map(
    unsettled.map((one) => [one.animalId, one.failedAttempts] as const)
  );
  // Only milk that left: what a buyer paid a litre is the price, not what the farm hoped for.
  const since = new Date(now.getTime() - farm.cullMilkPriceDays * DAY_MS);
  const dispatched = await db.query.dispatch.findMany({
    where: { farmId: farm.id, dispatchedAt: { gte: since, lte: now } },
    columns: { litres: true, pricePerLitreBdt: true },
  });
  const price = milkPriceOf(
    dispatched.map((one) => ({
      litres: Number(one.litres),
      pricePerLitreBdt: Number(one.pricePerLitreBdt),
    }))
  );
  const stoodBy = groupedBy(costs.history, (line) => line.animalId);
  return {
    /** What a litre fetched in the farm's Dispatches over its milk price window; nothing where none left. */
    milkPrice: price ? { ...price, since, days: farm.cullMilkPriceDays } : null,
    /** The Farm Parameter the Dispatches were read back over, in days, priced or not. */
    milkPriceDays: farm.cullMilkPriceDays,
    /** The Farm Parameter a cow's milk and keep are read back over, in days. */
    keepReadDays: farm.keepReadDays,
    /** The Farm Parameter a cow still empty after calving is named at, for the page to say. */
    openDays: farm.cullOpenDays,
    /** The Farm Parameter a cow's milk is weighed from, in days of her Lactation. */
    milkAfterDays: farm.cullMilkAfterDays,
    cows: cows
      .filter(
        (cow) =>
          cow.state === "milking" || cow.state === "dry" || repeat.has(cow.id)
      )
      .map((cow) => {
        const daysSinceCalving = daysInMilk(cow.lactationStartedAt, now);
        const milk =
          cow.state === "milking"
            ? milkAgainstKeep({
                kept: keptOver({
                  charges: keepChargesOf(costs, cow.id),
                  stood: stoodBy.get(cow.id) ?? [],
                  now,
                  readDays: farm.keepReadDays,
                }),
                litres: litresOver(
                  costs.ofAnimal.litres.get(cow.id) ?? [],
                  now,
                  farm.keepReadDays
                ),
                daysInMilk: daysSinceCalving,
                weighedAfterDays: farm.cullMilkAfterDays,
                price,
              })
            : null;
        const failedAttempts = repeat.get(cow.id) ?? null;
        return {
          tagNumber: cow.tagNumber,
          state: cow.state,
          penName: cow.pen.name,
          lactationNumber: cow.lactationNumber,
          daysSinceCalving,
          /** When she is expected to calve; nothing while nobody has found her carrying. */
          inCalfDue: cow.expectedCalvingAt,
          /** Heats served that did not take, for a Repeat Breeder nobody has answered for; nothing otherwise. */
          failedAttempts,
          milk,
          reasons: cullReasonsOf({
            state: cow.state,
            inCalf: cow.expectedCalvingAt !== null,
            daysSinceCalving,
            openDays: farm.cullOpenDays,
            milk,
            repeatBreeder: failedAttempts !== null,
          }),
        };
      }),
  };
};
