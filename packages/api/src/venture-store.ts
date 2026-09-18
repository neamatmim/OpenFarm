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

/** What has been signed for a Venture: the Units spoken for, and how many people hold them. */
export interface SignedFor {
  units: number;
  people: number;
}

const NOBODY: SignedFor = { units: 0, people: 0 };

/**
 * A Venture as a screen reads it: the plan it opened on, what it holds, who has signed for it, and the
 * Running Budget, which is whatever the Cattle Budget is not — worked out, never stored, so the two can
 * never drift apart.
 */
export const ventureView = (
  row: VentureRow,
  capitalInBdt: number,
  signedFor: SignedFor = NOBODY
) => ({
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
  signedFor,
  cancelledReason: row.cancelledReason,
});

/**
 * What each Venture has been signed for, in one query rather than one per Venture — the Owner's list draws
 * every Venture she has ever opened, and a query per card is a query per card.
 */
export const signedForEach = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[]
): Promise<Map<string, SignedFor>> => {
  const summary = new Map(ids.map((id) => [id, NOBODY]));
  if (ids.length === 0) {
    return summary;
  }
  const signed = await tx.query.investmentAgreement.findMany({
    where: { farmId, ventureId: { in: [...ids] } },
    columns: { ventureId: true, units: true },
  });
  for (const one of signed) {
    const soFar = summary.get(one.ventureId) ?? NOBODY;
    summary.set(one.ventureId, {
      units: soFar.units + one.units,
      people: soFar.people + 1,
    });
  }
  return summary;
};

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
  const signed = await signedForEach(tx, farmId, [row.id]);
  return ventureView(row, held.get(row.id) ?? 0, signed.get(row.id));
};
