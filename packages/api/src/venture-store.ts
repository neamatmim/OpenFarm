import type { VentureState } from "@OpenFarm/db/schema/venture";

import type { Tx } from "./audit";

/** A Venture's row, as the columns hold it. */
interface VentureRow {
  id: string;
  name: string;
  state: VentureState;
  targetCapitalBdt: string;
  floorBdt: string;
  decideBy: string;
  targetWindowStart: string;
  targetWindowEnd: string;
  unitPriceBdt: string;
  units: number;
  cattleBudgetBdt: string;
  cancelledReason: string | null;
}

/**
 * A Venture as a screen reads it: the plan it opened on, what it holds, and the Running Budget, which is
 * whatever the Cattle Budget is not — worked out, never stored, so the two can never drift apart.
 */
export const ventureView = (row: VentureRow, capitalInBdt: number) => ({
  id: row.id,
  name: row.name,
  state: row.state,
  targetCapitalBdt: Number(row.targetCapitalBdt),
  floorBdt: Number(row.floorBdt),
  decideBy: row.decideBy,
  targetWindow: { start: row.targetWindowStart, end: row.targetWindowEnd },
  unitPriceBdt: Number(row.unitPriceBdt),
  units: row.units,
  cattleBudgetBdt: Number(row.cattleBudgetBdt),
  runningBudgetBdt: Number(row.targetCapitalBdt) - Number(row.cattleBudgetBdt),
  capitalInBdt,
  cancelledReason: row.cancelledReason,
});

/**
 * What each Venture holds of its Investors' capital. Nothing pays in yet — the capital ticket brings that —
 * so this reads nothing today and every reader is already right for the day it does.
 */
export const capitalInBdt = (
  _tx: Pick<Tx, "query">,
  ids: readonly string[]
): Promise<Map<string, number>> =>
  Promise.resolve(new Map(ids.map((id) => [id, 0])));

/** The Venture as the trail records it. */
export const readVenture = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.venture.findFirst({ where: { id, farmId } });
  if (!row) {
    return null;
  }
  const held = await capitalInBdt(tx, [row.id]);
  return ventureView(row, held.get(row.id) ?? 0);
};
