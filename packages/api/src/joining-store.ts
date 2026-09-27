import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import type { JoiningHow } from "@OpenFarm/db/schema/fattening";
import { fatteningJoining } from "@OpenFarm/db/schema/fattening";
import type { TargetWindow } from "@OpenFarm/domain";
import { addDays, farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { farmsNextEid } from "./eid-store";

/** The price an Animal joined at: her weight that day, from a Weigh-in, times a rate a kilo. */
export interface JoiningPrice {
  priceBdt: number;
  weighInId: string;
  weightKg: number;
  rateBdtPerKg: number;
  note: string;
  pricedBy: string | null;
  pricedAt: Date;
}

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

/** A price as its columns keep it. */
const priceColumns = (price: JoiningPrice) => ({
  priceBdt: price.priceBdt,
  weighInId: price.weighInId,
  weightKg: price.weightKg.toFixed(2),
  rateBdtPerKg: price.rateBdtPerKg.toFixed(2),
  note: price.note,
  pricedBy: price.pricedBy,
  pricedAt: price.pricedAt,
});

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
 * What she weighed for her crossing to be priced from: her latest Weigh-in by the end of the day she crossed — the
 * morning's round after she was walked over counts — and none if nobody weighed her by then.
 */
export const weighedForTheCrossing = async (
  tx: Pick<Tx, "query">,
  animalId: string,
  joinedOn: string
): Promise<{ id: string; weightKg: number } | null> => {
  const reading = await tx.query.weighIn.findFirst({
    where: {
      animalId,
      weighedAt: { lt: startOfFarmDay(addDays(joinedOn, 1)) },
    },
    columns: { id: true, weightKg: true },
    orderBy: { weighedAt: "desc", id: "desc" },
  });
  return reading
    ? { id: reading.id, weightKg: Number(reading.weightKg) }
    : null;
};
