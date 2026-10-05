import { uuidv7 } from "@OpenFarm/db/ids";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import { farmDayOf } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { boughtInOf, costToItsOwner, farmCosts } from "./cost-store";
import { recordInternalSale } from "./internal-sale-store";
import { accountSaid, bookMoney, bookingOf } from "./money-store";
import {
  ownedThenByOf,
  readMovement,
  whatSheLastWeighed,
} from "./venture-store";

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
 * What she had cost the Venture to date, to the taka, as its Settlement charges it (`costToItsOwner`): what it paid to
 * take her on — her price where its own buying brought her in, or what it paid the Farm or another Venture for her —
 * and every charge on her since, while she was its own. Never her life on the farm before it had her.
 */
export const costToDateOf = async (
  tx: Parameters<typeof farmCosts>[0] & Pick<Tx, "query">,
  farmId: string,
  animalId: string,
  ventureId: string
): Promise<number> => {
  const [costs, ownedThenBy, boughtIn] = await Promise.all([
    farmCosts(tx, farmId),
    ownedThenByOf(tx, farmId),
    boughtInOf(tx, farmId),
  ]);
  const animal = costs.animals.find((one) => one.id === animalId);
  if (!animal) {
    return 0;
  }
  const back = boughtIn.get(animalId);
  return (
    costToItsOwner(
      costs,
      ownedThenBy,
      animal,
      ventureId,
      back && back.toVentureId === ventureId ? back : undefined
    ) ?? 0
  );
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
  const amountMoney = await costToDateOf(
    tx,
    farmId,
    made.animalId,
    made.ventureId
  );
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

/**
 * A Venture's lost animal found after the Farm made her good comes back as the Farm's own: the made-good transfer was
 * the Farm paying the Venture for her, so she is handed over on the day she is found, at what was made good — an
 * Internal Sale that moves no money of its own — and joins the Farm's Fattening at that price, fed towards the window
 * she was bought for. Nothing for an animal that was never made good.
 */
export const takenOnByTheFarm = async (
  tx: Tx,
  context: MakingGood,
  found: { animalId: string; ventureId: string; now: Date }
): Promise<void> => {
  const farmId = context.farm.id;
  const made = await tx.query.ventureMovement.findFirst({
    where: {
      farmId,
      ventureId: found.ventureId,
      animalId: found.animalId,
      kind: "made_good",
    },
    orderBy: { createdAt: "desc", id: "desc" },
    columns: { amountMoney: true, reference: true },
  });
  if (!made) {
    return;
  }
  const arrived = await tx.query.intake.findFirst({
    where: { farmId, animalId: found.animalId },
    columns: {
      weightKg: true,
      targetWindowStart: true,
      targetWindowEnd: true,
    },
  });
  const weighed = (await whatSheLastWeighed(tx, farmId, found.animalId)) ?? {
    id: null,
    weightKg: Number(arrived?.weightKg ?? 0),
  };
  const priceMoney = made.amountMoney;
  const day = farmDayOf(found.now);
  await recordInternalSale(tx, bookingOf(context, "owner", found.now), {
    id: uuidv7(found.now),
    animalId: found.animalId,
    from: found.ventureId,
    to: null,
    weighed: { id: weighed.id, weightKg: weighed.weightKg },
    rateMoneyPerKg:
      weighed.weightKg > 0
        ? Math.round((priceMoney / weighed.weightKg) * 100) / 100
        : 0,
    ...(arrived
      ? {
          targetWindow: {
            start: arrived.targetWindowStart,
            end: arrived.targetWindowEnd,
          },
        }
      : {}),
    note: `Made good when lost (${made.reference}); found ${day}`,
    soldOn: day,
    paymentMethod: "bank",
    reference: made.reference ?? "",
    madeGood: { priceMoney },
  });
};
