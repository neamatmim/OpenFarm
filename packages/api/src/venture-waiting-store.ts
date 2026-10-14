import type { Database } from "@OpenFarm/db";

import type { Tx } from "./audit";
import {
  monthBegan,
  owesPapers,
  papersOwedOf,
} from "./investor-statement-notice";

type Reader = Pick<Database | Tx, "query">;

/** How many of each Venture's Requests to Join still wait for the Owner's answer. */
export const requestsWaitingByEach = async (
  db: Reader,
  farmId: string,
  ventureIds: readonly string[]
): Promise<Map<string, number>> => {
  const waiting = new Map<string, number>();
  if (ventureIds.length === 0) {
    return waiting;
  }
  const rows = await db.query.requestToJoin.findMany({
    where: { farmId, ventureId: { in: [...ventureIds] }, state: "waiting" },
    columns: { ventureId: true },
  });
  for (const one of rows) {
    waiting.set(one.ventureId, (waiting.get(one.ventureId) ?? 0) + 1);
  }
  return waiting;
};

/** How many of each Venture's approved payouts have not yet gone out: a share with money to send and no payout
 *  movement against it. A share that comes to nothing has nothing to send. */
export const payoutsUnsentByEach = async (
  db: Reader,
  farmId: string,
  ventureIds: readonly string[]
): Promise<Map<string, number>> => {
  const unsent = new Map<string, number>();
  if (ventureIds.length === 0) {
    return unsent;
  }
  const settlements = await db.query.ventureSettlement.findMany({
    where: { farmId, ventureId: { in: [...ventureIds] } },
    columns: { id: true, ventureId: true },
  });
  if (settlements.length === 0) {
    return unsent;
  }
  const ventureOf = new Map(settlements.map((one) => [one.id, one.ventureId]));
  const shares = await db.query.ventureSettlementShare.findMany({
    where: {
      farmId,
      settlementId: { in: settlements.map((one) => one.id) },
      paidMovementId: { isNull: true },
      payoutMoney: { gt: 0 },
    },
    columns: { settlementId: true },
  });
  for (const one of shares) {
    const ventureId = ventureOf.get(one.settlementId);
    if (ventureId) {
      unsent.set(ventureId, (unsent.get(ventureId) ?? 0) + 1);
    }
  }
  return unsent;
};

/**
 * How many of each running Venture's Investors have not been handed this month's progress statement yet — read by the
 * one rule the telling and the sweep that settles it read (`papersOwedOf`), so the card and the notice never disagree.
 */
export const statementsDueByEach = async (
  db: Reader,
  farmId: string,
  ventures: readonly { id: string; state: string }[],
  now: Date
): Promise<Map<string, number>> => {
  const owing = await papersOwedOf(
    db,
    farmId,
    ventures.filter((one) => owesPapers(one)).map((one) => one.id),
    () => monthBegan(now)
  );
  return new Map([...owing].map(([id, one]) => [id, one.owed]));
};
