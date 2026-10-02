import type { Tx } from "./audit";
import { chargedOf, economicsOfAnimal, farmCosts } from "./cost-store";
import type { Raised as RaisedAlert } from "./notice";
import { tell } from "./notice";

/**
 * Tells the Owner of a death or a cull, at once — unless she wrote it herself: her tag, died or culled, the cause, what she
 * cost the farm, bought for and every charge on her, and whose she was where she was a Venture's. About the Mortality, so
 * told once; a Correction tells nobody. What was raised, for the caller to push once the write has closed.
 */
export const tellOfTheDeath = async (
  tx: Tx,
  farmId: string,
  death: { id: string; animalId: string; writtenBy: string },
  now: Date
): Promise<RaisedAlert[]> => {
  const row = await tx.query.mortality.findFirst({
    where: { id: death.id, farmId },
    columns: { kind: true, cause: true },
    with: {
      animal: {
        columns: { id: true, tagNumber: true, ownerVentureId: true },
        with: { owner: { columns: { name: true } } },
      },
    },
  });
  if (!row?.animal) {
    return [];
  }
  const costs = await farmCosts(tx, farmId);
  const costed = costs.animals.find((one) => one.id === death.animalId);
  const costBdt = costed
    ? (() => {
        const economics = economicsOfAnimal(costs, costed);
        return Math.round((economics.purchaseBdt ?? 0) + chargedOf(economics));
      })()
    : 0;
  return await tell(
    tx,
    farmId,
    {
      kind: "mortality_recorded",
      about: { id: death.id, writtenBy: death.writtenBy },
      facts: {
        tag: row.animal.tagNumber,
        kind: row.kind,
        cause: row.cause,
        costBdt,
        venture: row.animal.owner?.name ?? null,
      },
    },
    now
  );
};
