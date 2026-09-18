import type {
  VentureMovementKind,
  VentureState,
} from "@OpenFarm/db/schema/venture";

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

/** What a Venture's own account has seen: its Investors' capital, what went back, what it has spent and
 *  what it has paid out. Spending and payouts arrive with the buying and settlement work; they are read
 *  as nothing until then, so every reader is already right for the day they do. */
export interface Held {
  capitalInBdt: number;
  refundedBdt: number;
  spentBdt: number;
  paidOutBdt: number;
  /** Of what has gone out, how much was drawn against the Cattle Budget. A Buying Float is cattle
   *  money: it buys cattle or it comes home again. */
  cattleOutBdt: number;
}

/** What a Venture Account should be holding: everything that came in, less everything that left. */
export const balanceOf = (held: Held) =>
  held.capitalInBdt - held.refundedBdt - held.spentBdt - held.paidOutBdt;

const NOTHING_HELD: Held = {
  capitalInBdt: 0,
  refundedBdt: 0,
  spentBdt: 0,
  paidOutBdt: 0,
  cattleOutBdt: 0,
};

/**
 * A Venture as a screen reads it: the plan it opened on, what it holds, who has signed for it, and the
 * Running Budget, which is whatever the Cattle Budget is not — worked out, never stored, so the two can
 * never drift apart.
 */
export const ventureView = (
  row: VentureRow,
  held: Held = NOTHING_HELD,
  signedFor: SignedFor = NOBODY
) => {
  const balanceBdt = balanceOf(held);
  // The budgets are a plan for the whole capital, so what has actually arrived is split in the same
  // proportion: a Venture half funded holds half of each, rather than a full Cattle Budget and nothing
  // to feed the animals with.
  // What of the capital arrived for cattle, less what has already been drawn against it. The plan's
  // proportion decides what came in for each budget; after that the two are spent from separately, so a
  // Float to the haat takes nothing from the money that keeps the animals.
  const target = Number(row.targetCapitalBdt);
  const cameInForCattle =
    target > 0
      ? Math.round(
          ((held.capitalInBdt - held.refundedBdt) *
            Number(row.cattleBudgetBdt)) /
            target
        )
      : 0;
  const cattleBudgetHeldBdt = cameInForCattle - held.cattleOutBdt;
  return {
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
    runningBudgetBdt:
      Number(row.targetCapitalBdt) - Number(row.cattleBudgetBdt),
    ...held,
    balanceBdt,
    /** What of the balance is meant for buying animals, and what keeps them. Each is read from its own
     *  side rather than one being the remainder of the other: a figure that is the leftover of another
     *  figure hides whatever went wrong in whichever of the two nobody was looking at. */
    cattleBudgetHeldBdt,
    runningBudgetHeldBdt: balanceBdt - cameInForCattle + held.cattleOutBdt,
    signedFor,
    cancelledReason: row.cancelledReason,
  };
};

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
 * What each kind of movement does to a Venture's figures: which line it lands on, which way it moves it,
 * and whether it is drawn against the Cattle Budget or the Running one. One record per kind, so a new
 * kind is one entry here and not a sum rewritten in three places.
 *
 * The sign is what makes the Float honest when it comes home: the cash brought back is the same line and
 * the same budget as the Float that took it, moving the other way.
 */
const WHAT_IT_DOES = {
  capital_in: { line: "capitalInBdt", sign: 1, cattle: 0 },
  refund: { line: "refundedBdt", sign: 1, cattle: 0 },
  // A Float is money out of the account the moment it is drawn: it is in the Manager's hand at the
  // haat, not in the bank, and it is cattle money — it buys cattle or it comes home again.
  float_out: { line: "spentBdt", sign: 1, cattle: 1 },
} as const satisfies Record<
  VentureMovementKind,
  { line: keyof Held; sign: 1 | -1; cattle: 0 | 1 | -1 }
>;

/**
 * What each Venture's account has seen, in one query for the whole list. Capital in and refunds are
 * Venture Movements; spending and payouts are read as nothing until the work that makes them arrives.
 */
export const heldByEach = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[]
): Promise<Map<string, Held>> => {
  const held = new Map(ids.map((id) => [id, NOTHING_HELD]));
  if (ids.length === 0) {
    return held;
  }
  const movements = await tx.query.ventureMovement.findMany({
    where: { farmId, ventureId: { in: [...ids] } },
    columns: { ventureId: true, kind: true, amountBdt: true },
  });
  for (const one of movements) {
    const soFar = held.get(one.ventureId) ?? NOTHING_HELD;
    const does = WHAT_IT_DOES[one.kind];
    const taka = Number(one.amountBdt);
    held.set(one.ventureId, {
      ...soFar,
      [does.line]: soFar[does.line] + does.sign * taka,
      cattleOutBdt: soFar.cattleOutBdt + does.cattle * taka,
    });
  }
  return held;
};

/** What one Agreement has already taken in: an Investor pays for the Units they hold, and no more. */
export const takenAgainst = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  agreementId: string
): Promise<number> => {
  const rows = await tx.query.ventureMovement.findMany({
    where: { farmId, agreementId, kind: "capital_in" },
    columns: { amountBdt: true },
  });
  return rows.reduce((sum, one) => sum + Number(one.amountBdt), 0);
};

/** One Venture Movement as the trail records it: whose money, which way, how much and against what
 *  reference. */
export const readMovement = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.ventureMovement.findFirst({
    where: { id, farmId },
  });
  return row
    ? {
        ventureId: row.ventureId,
        kind: row.kind,
        agreementId: row.agreementId,
        buyingTripId: row.buyingTripId,
        amountBdt: Number(row.amountBdt),
        movedOn: row.movedOn,
        reference: row.reference,
        refundsId: row.refundsId,
      }
    : null;
};

/** The Venture as the trail records it. */
export const readVenture = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.venture.findFirst({ where: { id, farmId } });
  if (!row) {
    return null;
  }
  const held = await heldByEach(tx, farmId, [row.id]);
  const signed = await signedForEach(tx, farmId, [row.id]);
  return ventureView(row, held.get(row.id), signed.get(row.id));
};
