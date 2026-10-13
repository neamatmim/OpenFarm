import {
  farmDayOf,
  monthBefore,
  monthRangeOf,
  roundMoney,
  startOfFarmDay,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { BankStanding } from "./bank-standing";
import { standingOf } from "./bank-standing";

/** The instant a month ends, by the farm's clock: the first moment of the next. */
const endOf = (month: string): Date => monthRangeOf(month).until;

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
  return roundMoney(held);
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

/**
 * What the farm believes each of its Farm Accounts held at a moment — retired ones too, which may still hold money —
 * or nothing for one not read by then: its first reading is of a month's end, and before that end there is no figure to
 * start from (CONTEXT.md: **Cash Position**). Each by its name, so one counting nothing can be said.
 */
export const farmAccountsHeldAt = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  at: Date
): Promise<{ name: string; retired: boolean; heldMoney: number | null }[]> => {
  const accounts = await tx.query.farmAccount.findMany({
    where: { farmId },
    columns: { id: true, name: true, retiredAt: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  return await Promise.all(
    accounts.map(async ({ id, name, retiredAt }) => {
      const retired = retiredAt !== null;
      const first = await firstReadingOf(tx, farmId, id);
      const readAt = first ? endOf(first.forMonth) : null;
      if (!(first && readAt && readAt <= at)) {
        return { name, retired, heldMoney: null };
      }
      return {
        name,
        retired,
        heldMoney: heldAtEnd(
          first,
          await movedSince(tx, farmId, id, readAt),
          at
        ),
      };
    })
  );
};

/** How a Farm Account stands against its statements, and what the farm believes it holds now. */
export type FarmAccountStanding = BankStanding & {
  /** What the farm believes it holds today: its first reading and everything since. */
  heldNowMoney: number;
};

/** Every reading of these accounts' statements, oldest month first. */
const checksOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[]
) =>
  ids.length === 0
    ? []
    : await tx.query.farmAccountCheck.findMany({
        where: { farmId, farmAccountId: { in: [...ids] } },
        orderBy: { forMonth: "asc", id: "asc" },
      });

/** How each account stands, from readings already in hand. */
const standingFrom = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[],
  checks: Awaited<ReturnType<typeof checksOf>>,
  now: Date
): Promise<Map<string, FarmAccountStanding>> => {
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
 * How each of these Farm Accounts stands against its statements — the months still out, worked out by the same rule a
 * Venture Account's are — and what the farm believes it holds now. An account never read has no standing.
 */
export const farmAccountStandingOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[],
  now: Date
): Promise<Map<string, FarmAccountStanding>> =>
  await standingFrom(tx, farmId, ids, await checksOf(tx, farmId, ids), now);

/** The month after this one. */
const monthAfter = (month: string): string => {
  const year = Number(month.slice(0, 4));
  const at = Number(month.slice(5, 7));
  return at === 12
    ? `${year + 1}-01`
    : `${year}-${String(at + 1).padStart(2, "0")}`;
};

/** An account with a month still out against its statement: disagreed, or gone stale since. */
export interface FarmAccountOut {
  id: string;
  name: string;
  monthsOut: string[];
  monthsStale: string[];
}

/** An account with a month's statement nobody has read: the oldest such month, and how many there are. */
export interface FarmAccountUnread {
  id: string;
  name: string;
  oldestMonth: string;
  months: number;
}

/**
 * The months an account owes a reading: from its first reading — no month before that can be read — or, never read,
 * from the month it was listed, up to the last month that is over; less those read. The oldest, and how many.
 */
const unreadMonthsOf = (
  listedMonth: string,
  read: readonly string[],
  lastMonth: string
): { oldestMonth: string; months: number } | null => {
  const [firstRead] = read;
  const readOnes = new Set(read);
  let oldestMonth = "";
  let months = 0;
  for (
    let month = firstRead ?? listedMonth;
    month <= lastMonth;
    month = monthAfter(month)
  ) {
    if (!readOnes.has(month)) {
      oldestMonth ||= month;
      months += 1;
    }
  }
  return months === 0 ? null : { oldestMonth, months };
};

/**
 * What the Farm's mobile money numbers and bank accounts ask of the Owner's home, read once for both:
 *
 * - **out** — a month whose statement disagreed, or one the farm has since changed its mind about. Retired accounts too:
 *   a month that disagreed before one closed is still money nobody has explained.
 * - **unread** — the monthly **Bank Check** asked for, the way a month's rent not entered is: every month nobody has
 *   read, up to the last month that is over, and not forgotten when a later month is read. An account closed before
 *   this month is read no more; one closed in it is asked for still while its last month is unread.
 */
export const farmAccountsToSee = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  now: Date
): Promise<{ out: FarmAccountOut[]; unread: FarmAccountUnread[] }> => {
  const accounts = await tx.query.farmAccount.findMany({
    where: { farmId },
    columns: { id: true, name: true, createdAt: true, retiredAt: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const ids = accounts.map((one) => one.id);
  const checks = await checksOf(tx, farmId, ids);
  const standing = await standingFrom(tx, farmId, ids, checks, now);
  const today = farmDayOf(now);
  const lastMonth = monthBefore(today);
  const thisMonthBegan = startOfFarmDay(`${today.slice(0, 7)}-01`);
  const out = accounts.flatMap((one) => {
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
  const unread = accounts.flatMap((one) => {
    if (one.retiredAt && one.retiredAt < thisMonthBegan) {
      return [];
    }
    const owed = unreadMonthsOf(
      farmDayOf(one.createdAt).slice(0, 7),
      checks
        .filter((check) => check.farmAccountId === one.id)
        .map((check) => check.forMonth),
      lastMonth
    );
    return owed ? [{ id: one.id, name: one.name, ...owed }] : [];
  });
  return { out, unread };
};
