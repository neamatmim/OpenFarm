import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import type { JoiningHow } from "@OpenFarm/db/schema/fattening";
import { fatteningJoining } from "@OpenFarm/db/schema/fattening";
import type { TargetWindow } from "@OpenFarm/domain";
import { addDays, farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { farmsNextEid } from "./eid-store";
import { joiningWeighedBy } from "./fattening-store";

/** The price an Animal joined at: her weight that day, from a Weigh-in, times a rate a kilo. A Venture's lost animal
 *  found after the Farm made her good joins at what it paid, and — never weighed since her Intake — on no Weigh-in. */
export interface JoiningPrice {
  priceMoney: number;
  weighInId: string | null;
  weightKg: number;
  rateMoneyPerKg: number;
  note: string;
  pricedBy: string | null;
  pricedAt: Date;
}

/** A price as its columns keep it. */
const priceColumns = (price: JoiningPrice) => ({
  priceMoney: price.priceMoney,
  weighInId: price.weighInId,
  weightKg: price.weightKg.toFixed(2),
  rateMoneyPerKg: price.rateMoneyPerKg.toFixed(2),
  note: price.note,
  pricedBy: price.pricedBy,
  pricedAt: price.pricedAt,
});

/**
 * Puts an Animal who has come to the Farm's own Fattening side other than by Intake — walked across from Dairy, or bought
 * from a Venture — into the **Season** of her Target Window, from the moment she came. The window is the one said, or
 * the next Eid from that day, the announced day standing in for the one expected; what she is fed towards is the Farm
 * Parameter's, as an Intake's is. A crossing comes unpriced; one bought from a Venture comes at the Internal Sale's
 * price.
 */
export const joinTheFattening = async (
  tx: Tx,
  joining: {
    farmId: string;
    animalId: string;
    joinedAt: Date;
    how: JoiningHow;
    moveId?: string;
    internalSaleId?: string;
    targetWindow?: TargetWindow;
    price?: JoiningPrice;
    recordedBy: string | null;
    now: Date;
  }
): Promise<{ id: string; targetWindow: TargetWindow }> => {
  const joinedOn = farmDayOf(joining.joinedAt);
  const targetWindow =
    joining.targetWindow ??
    (await farmsNextEid(tx, joining.farmId, joinedOn)) ??
    null;
  if (!targetWindow) {
    // Only where the runtime has no calendar to ask for the next Eid: the window has to be said.
    throw new ORPCError("BAD_REQUEST", {
      message: "Say which Target Window she is being fed towards",
      data: { refusal: "joining_needs_a_window" },
    });
  }
  const standing = await tx.query.farm.findFirst({
    where: { id: joining.farmId },
    columns: { fatteningTargetWeightKg: true },
  });
  const id = uuidv7(joining.now);
  await tx.insert(fatteningJoining).values({
    id,
    farmId: joining.farmId,
    animalId: joining.animalId,
    joinedOn,
    joinedAt: joining.joinedAt,
    how: joining.how,
    moveId: joining.moveId ?? null,
    internalSaleId: joining.internalSaleId ?? null,
    targetWindowStart: targetWindow.start,
    targetWindowEnd: targetWindow.end,
    targetWeightKg: String(standing?.fatteningTargetWeightKg ?? 0),
    ...(joining.price ? priceColumns(joining.price) : {}),
    recordedBy: joining.recordedBy,
    createdAt: joining.now,
  });
  return {
    id,
    targetWindow: { start: targetWindow.start, end: targetWindow.end },
  };
};

/** Sets, or puts right, the price a joining came in at. */
export const priceTheJoining = async (
  tx: Tx,
  joiningId: string,
  price: JoiningPrice
): Promise<void> => {
  await tx
    .update(fatteningJoining)
    .set(priceColumns(price))
    .where(eq(fatteningJoining.id, joiningId));
};

/**
 * What she weighed for her crossing to be priced from: her latest Weigh-in the farm did not doubt by the end of the day she
 * crossed — the morning's round after she was walked over counts — so long as it is no older than the farm's days a
 * price may be struck from, as an Internal Sale's is: a calf weighed at birth and crossed months later is not priced at
 * her birth weight. Else her first one after it: a calf that would not go on the crush that morning is priced from the
 * next round she did, rather than never, which would leave her Season unfinished for good. None while she has never
 * been weighed.
 */
export const weighedForTheCrossing = async (
  tx: Pick<Tx, "query">,
  animalId: string,
  joinedOn: string,
  /** The Farm Parameter: how many days old a weighing may be and still price her. */
  priceWeighInDays: number
): Promise<{ id: string; weightKg: number } | null> => {
  const byThen = joiningWeighedBy(joinedOn);
  const notBefore = startOfFarmDay(addDays(joinedOn, -priceWeighInDays));
  const reading =
    (await tx.query.weighIn.findFirst({
      where: {
        animalId,
        weighedAt: { gte: notBefore, lt: byThen },
        flaggedNote: { isNull: true },
      },
      columns: { id: true, weightKg: true },
      orderBy: { weighedAt: "desc", id: "desc" },
    })) ??
    (await tx.query.weighIn.findFirst({
      where: {
        animalId,
        weighedAt: { gte: byThen },
        flaggedNote: { isNull: true },
      },
      columns: { id: true, weightKg: true },
      orderBy: { weighedAt: "asc", id: "asc" },
    }));
  return reading
    ? { id: reading.id, weightKg: Number(reading.weightKg) }
    : null;
};
