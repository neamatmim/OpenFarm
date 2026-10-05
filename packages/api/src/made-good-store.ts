import { uuidv7 } from "@OpenFarm/db/ids";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import { farmDayOf } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { chargedOf, economicsOfAnimal, farmCosts } from "./cost-store";
import { accountSaid, bookMoney, bookingOf } from "./money-store";
import { readMovement } from "./venture-store";

// A Venture's lost animal made good by the Farm (lose-less A-04): the Farm pays the Venture what she had cost it to
// date — her price and every charge on her — by bank into its account, so a theft or a stray costs its Investors
// nothing. Her made-good money lands with the Venture's proceeds, as her price from a buyer would have; on the Farm's own
// books it is money out.

/** Who makes her good: the Owner, writing her off, on this farm. */
type MakingGood = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/**
 * What she had cost the Venture to date, to the taka: her price and every charge on her, as the costing has them —
 * the same figure the death notice gives the Owner, so a lost animal and a dead one are costed one way.
 */
export const costToDateOf = async (
  tx: Tx,
  farmId: string,
  animalId: string
): Promise<number> => {
  const costs = await farmCosts(tx, farmId);
  const costed = costs.animals.find((one) => one.id === animalId);
  if (!costed) {
    return 0;
  }
  const economics = economicsOfAnimal(costs, costed);
  return Math.round((economics.purchaseMoney ?? 0) + chargedOf(economics));
};

/**
 * Makes one of a Venture's animals good, inside the write-off's own transaction: a Venture Movement `made_good` of her
 * cost to date, by bank, with the transfer's reference, and the Farm's Money Event out beside it. Nothing for an animal
 * that cost nothing.
 */
export const makeGood = async (
  tx: Tx,
  context: MakingGood,
  made: {
    animalId: string;
    ventureId: string;
    now: Date;
    reference: string;
    farmAccountId?: string;
  }
): Promise<void> => {
  const farmId = context.farm.id;
  const amountMoney = await costToDateOf(tx, farmId, made.animalId);
  if (amountMoney <= 0) {
    return;
  }
  const id = uuidv7(made.now);
  await tx.insert(ventureMovement).values({
    id,
    farmId,
    ventureId: made.ventureId,
    kind: "made_good",
    animalId: made.animalId,
    amountMoney,
    movedOn: farmDayOf(made.now),
    reference: made.reference,
    recordedBy: context.actor.id,
    createdAt: made.now,
  });
  await bookMoney(
    tx,
    bookingOf(
      context,
      "owner",
      made.now,
      accountSaid(["venture_made_good"], {
        reference: made.reference,
        ...(made.farmAccountId === undefined
          ? {}
          : { farmAccountId: made.farmAccountId }),
      })
    ),
    {
      source: "venture_made_good",
      sourceId: id,
      amountMoney,
      occurredAt: made.now,
      counterpartyId: null,
      paymentMethod: "bank",
    }
  );
  await audited(context).recordEvent(
    tx,
    { entity: "venture_movement", entityId: id, action: "create" },
    { after: await readMovement(tx, farmId, id) }
  );
};
