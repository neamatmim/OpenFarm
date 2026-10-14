import type { Database } from "@OpenFarm/db";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";

import type { Tx } from "./audit";

type Reader = Pick<Database | Tx, "query">;

/** The Ventures whose Investors are owed a progress statement each month: those whose animals are being kept. */
const RUNNING: ReadonlySet<string> = new Set([
  "buying",
  "fattening",
  "selling",
]);

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

/** How many of each Venture's approved payouts have not yet gone out: a share with no payout movement against it. */
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
 * How many of each running Venture's Investors have not been handed this month's progress statement yet: owed once a
 * month of the run is over — a Venture opened this month owes none — and made when its paper is exported for them, as
 * the evening's sweep counts it when it settles the notice.
 */
export const statementsDueByEach = async (
  db: Reader,
  farmId: string,
  ventures: readonly { id: string; state: string; createdAt: Date }[],
  now: Date
): Promise<Map<string, number>> => {
  const due = new Map<string, number>();
  const monthBegan = startOfFarmDay(`${farmDayOf(now).slice(0, 7)}-01`);
  const owing = ventures.filter(
    (one) => RUNNING.has(one.state) && one.createdAt < monthBegan
  );
  if (owing.length === 0) {
    return due;
  }
  const agreements = await db.query.investmentAgreement.findMany({
    where: { farmId, ventureId: { in: owing.map((one) => one.id) } },
    columns: { id: true, ventureId: true, investorId: true },
  });
  // The Farm's own capital is no Investor to hand a paper to.
  const people = agreements.filter((one) => one.investorId !== null);
  if (people.length === 0) {
    return due;
  }
  const made = await db.query.auditEvent.findMany({
    where: {
      farmId,
      entity: "investment_agreement",
      entityId: { in: people.map((one) => one.id) },
      action: "export",
      receivedAt: { gte: monthBegan },
    },
    columns: { entityId: true, after: true },
  });
  const handed = new Set(
    made
      .filter(
        (event) =>
          (event.after as { paper?: unknown } | null)?.paper ===
          "progress_statement"
      )
      .map((event) => event.entityId)
  );
  for (const one of people) {
    if (!handed.has(one.id)) {
      due.set(one.ventureId, (due.get(one.ventureId) ?? 0) + 1);
    }
  }
  return due;
};
