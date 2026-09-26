import type { Tx } from "./audit";
import { ownedThenByOf } from "./venture-store";

/**
 * What a Venture bought: every animal that was its own on the day she came — wherever she is now, so one sold across to
 * another Venture later still counts where she was bought — with what she weighed and cost coming off the lorry; and
 * every animal it took across from another Venture or the farm by an Internal Sale, paid for from its cattle budget,
 * with what she weighed and cost that day.
 */
export const boughtFor = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<{ weightKg: number; priceBdt: number }[]> => {
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
      columns: { weightKg: true, priceBdt: true },
    }),
  ]);
  return [
    ...intakes
      .filter((one) => ownedThenBy(one.animalId, one.arrivedAt) === ventureId)
      .map((one) => ({
        weightKg: Number(one.weightKg),
        priceBdt: one.purchasePriceBdt,
      })),
    ...across.map((one) => ({
      weightKg: Number(one.weightKg),
      priceBdt: one.priceBdt,
    })),
  ];
};
