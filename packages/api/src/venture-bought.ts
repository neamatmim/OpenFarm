import type { Tx } from "./audit";
import { ownedThenByOf } from "./venture-store";

/**
 * What a Venture bought: every animal that was its own on the day she came — wherever she is now, so one sold across to
 * another Venture later still counts where she was bought — with what she weighed and cost coming off the lorry.
 */
export const boughtFor = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<{ weightKg: number; priceBdt: number }[]> => {
  const ownedThenBy = await ownedThenByOf(db, farmId);
  const intakes = await db.query.intake.findMany({
    where: { farmId },
    columns: {
      animalId: true,
      weightKg: true,
      purchasePriceBdt: true,
      arrivedAt: true,
    },
  });
  return intakes
    .filter((one) => ownedThenBy(one.animalId, one.arrivedAt) === ventureId)
    .map((one) => ({
      weightKg: Number(one.weightKg),
      priceBdt: one.purchasePriceBdt,
    }));
};
