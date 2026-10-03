import { monthOf, roundTaka, startOfFarmDay } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { BankStanding } from "./bank-standing";
import { standingOf } from "./bank-standing";

/** The instant a month ends, by the farm's clock: the first moment of the next. */
const endOf = (month: string): Date =>
  monthOf(startOfFarmDay(`${month}-01`)).until;

/** One movement of a Farm Account's money: a Money Event naming it, or a Handover into or out of it. */
interface Moved {
  at: Date;
  amount: number;
}

/**
 * Everything that moved a Farm Account's money after its first reading, signed, oldest first: Money Events naming it,
 * in less out, and Handovers into it less those out of it.
 */
const movedSince = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  farmAccountId: string,
  since: Date
): Promise<Moved[]> => {
  const [money, handovers] = await Promise.all([
    tx.query.moneyEvent.findMany({
      where: { farmId, farmAccountId, occurredAt: { gte: since } },
      columns: { direction: true, amountMoney: true, occurredAt: true },
    }),
    tx.query.handover.findMany({
      where: {
        farmId,
        handedAt: { gte: since },
        OR: [{ fromAccountId: farmAccountId }, { toAccountId: farmAccountId }],
      },
      columns: {
        fromAccountId: true,
        toAccountId: true,
        amountMoney: true,
        handedAt: true,
      },
    }),
  ]);
  return [
    ...money.map((one) => ({
      at: one.occurredAt,
      amount: one.direction === "in" ? one.amountMoney : -one.amountMoney,
    })),
    ...handovers.map((one) => ({
      at: one.handedAt,
      amount:
        (one.toAccountId === farmAccountId ? one.amountMoney : 0) -
        (one.fromAccountId === farmAccountId ? one.amountMoney : 0),
    })),
  ].toSorted((a, b) => a.at.getTime() - b.at.getTime());
};

/** A Farm Account's first reading: what its statement said it held at the end of that month. */
interface FirstReading {
  forMonth: string;
  readMoney: number;
}

/**
 * What the farm believes a Farm Account held at the end of a month on or after its first reading: that reading, and
 * everything that moved its money after that month and up to this one's end.
 */
const heldAtEnd = (
  first: FirstReading,
  moved: readonly Moved[],
  until: Date
): number => {
  let held = first.readMoney;
  for (const one of moved) {
    if (one.at < until) {
      held += one.amount;
    }
  }
  return roundTaka(held);
};

/** The first reading of a Farm Account, or nothing if its statement has never been read. */
export const firstReadingOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  farmAccountId: string
): Promise<FirstReading | null> => {
  const first = await tx.query.farmAccountCheck.findFirst({
    where: { farmId, farmAccountId },
    columns: { forMonth: true, readMoney: true },
    orderBy: { forMonth: "asc" },
  });
  return first ?? null;
};

/**
 * What the farm believes a Farm Account held at a month's end, or nothing before its first reading — there is no figure
 * to start from until somebody has read a statement.
 */
export const believedAtMonthEnd = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  farmAccountId: string,
  month: string
): Promise<number | null> => {
  const first = await firstReadingOf(tx, farmId, farmAccountId);
  if (!first || month < first.forMonth) {
    return null;
  }
  const moved = await movedSince(
    tx,
    farmId,
    farmAccountId,
    endOf(first.forMonth)
  );
  return heldAtEnd(first, moved, endOf(month));
};

/** How a Farm Account stands against its statements, and what the farm believes it holds now. */
export type FarmAccountStanding = BankStanding & {
  /** What the farm believes it holds today: its first reading and everything since. */
  heldNowMoney: number;
};

/**
 * How each of these Farm Accounts stands against its statements — the months still out, worked out by the same rule a
 * Venture Account's are — and what the farm believes it holds now. An account never read has no standing.
 */
export const farmAccountStandingOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[],
  now: Date
): Promise<Map<string, FarmAccountStanding>> => {
  const checks =
    ids.length === 0
      ? []
      : await tx.query.farmAccountCheck.findMany({
          where: { farmId, farmAccountId: { in: [...ids] } },
          orderBy: { forMonth: "asc", id: "asc" },
        });
  const standing = new Map<string, FarmAccountStanding>();
  for (const id of ids) {
    const its = checks.filter((one) => one.farmAccountId === id);
    const [first] = its;
    if (!first) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- a farm has a handful of accounts
    const moved = await movedSince(tx, farmId, id, endOf(first.forMonth));
    standing.set(id, {
      ...standingOf(its, (month) => heldAtEnd(first, moved, endOf(month))),
      heldNowMoney: heldAtEnd(first, moved, new Date(now.getTime() + 1)),
    });
  }
  return standing;
};

/**
 * The Farm Accounts with a month still out against their statements — disagreed or gone stale — for the Owner's home.
 * Retired accounts too: a month that disagreed before one closed is still money nobody has explained.
 */
export const farmAccountsOut = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  now: Date
): Promise<
  { id: string; name: string; monthsOut: string[]; monthsStale: string[] }[]
> => {
  const accounts = await tx.query.farmAccount.findMany({
    where: { farmId },
    columns: { id: true, name: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const standing = await farmAccountStandingOf(
    tx,
    farmId,
    accounts.map((one) => one.id),
    now
  );
  return accounts.flatMap((one) => {
    const its = standing.get(one.id);
    return its && its.monthsOut.length > 0
      ? [
          {
            id: one.id,
            name: one.name,
            monthsOut: its.monthsOut,
            monthsStale: its.monthsStale,
          },
        ]
      : [];
  });
};
