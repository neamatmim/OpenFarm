import type { PlanBought } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { ownedThenByOf } from "./venture-store";

/**
 * What a Venture bought: every animal that was its own on the day she came — wherever she is now, so one sold across to
 * another Venture later still counts where she was bought — with what she weighed and cost coming off the lorry; and
 * every animal it took across from another Venture or the farm by an Internal Sale, paid for from its cattle budget,
 * with what she weighed and cost that day. Each with her Breed, which a plan's line may name.
 */
export const boughtFor = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<PlanBought[]> => {
  const [ownedThenBy, intakes, across] = await Promise.all([
    ownedThenByOf(db, farmId),
    db.query.intake.findMany({
      where: { farmId },
      columns: {
        animalId: true,
        weightKg: true,
        purchasePriceBdt: true,
        arrivedAt: true,
      },
    }),
    db.query.internalSale.findMany({
      where: { farmId, toVentureId: ventureId },
      columns: { animalId: true, weightKg: true, priceBdt: true },
    }),
  ]);
  const ours = intakes.filter(
    (one) => ownedThenBy(one.animalId, one.arrivedAt) === ventureId
  );
  const breeds = await db.query.animal.findMany({
    where: {
      farmId,
      id: { in: [...ours, ...across].map((one) => one.animalId) },
    },
    columns: { id: true, breedId: true },
  });
  const breedOf = new Map(breeds.map((one) => [one.id, one.breedId]));
  return [
    ...ours.map((one) => ({
      weightKg: Number(one.weightKg),
      priceBdt: one.purchasePriceBdt,
      breedId: breedOf.get(one.animalId) ?? null,
    })),
    ...across.map((one) => ({
      weightKg: Number(one.weightKg),
      priceBdt: one.priceBdt,
      breedId: breedOf.get(one.animalId) ?? null,
    })),
  ];
};
