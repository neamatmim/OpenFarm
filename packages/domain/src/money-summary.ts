import type { Side } from "./lifecycle";
import { roundTaka } from "./money";

/** Part of a Money Event that belongs to a Side, or to the whole farm when the Side is null. */
export interface SideShare {
  side: Side | null;
  amountBdt: number;
}

/** One Money Event as the accountant's summary adds it up. */
export interface MoneyToSummarise {
  direction: "in" | "out";
  amountBdt: number;
  categoryBn: string;
  categoryEn: string | null;
  counterpartyName: string | null;
  /** Which Side its money belongs to — most of it one Side or the whole farm, a Vet Fee for animals on
   *  both Sides split between them. */
  sides: readonly SideShare[];
  awaitingApproval: boolean;
}

/** Money in and money out. */
export interface InAndOut {
  inBdt: number;
  outBdt: number;
}

/** The accountant's summary of a period: income against expense, by Category, Counterparty and Side. */
export interface MoneySummary {
  incomeBdt: number;
  expenseBdt: number;
  netBdt: number;
  byCategory: ({ nameBn: string; nameEn: string | null } & InAndOut)[];
  byCounterparty: ({ name: string | null } & InAndOut)[];
  bySide: ({ side: Side | null } & InAndOut)[];
  /** Money in the period the Owner has not yet approved: in the sums, and said apart — in and out
   *  apart too, because a sum of both would mean nothing. */
  awaiting: { count: number } & InAndOut;
}

const SIDE_ORDER: (Side | null)[] = ["dairy", "fattening", null];

/** Adds an amount into the running in-and-out for its key. */
const tally = <K>(
  totals: Map<K, InAndOut>,
  key: K,
  direction: "in" | "out",
  amountBdt: number
): void => {
  const running = totals.get(key) ?? { inBdt: 0, outBdt: 0 };
  if (direction === "in") {
    running.inBdt += amountBdt;
  } else {
    running.outBdt += amountBdt;
  }
  totals.set(key, running);
};

const rounded = (totals: InAndOut): InAndOut => ({
  inBdt: roundTaka(totals.inBdt),
  outBdt: roundTaka(totals.outBdt),
});

/**
 * A period's money added up for the accountant: income and expense and what is left, by Category, by
 * Counterparty and by Side — the Dairy side, the Fattening side, and the whole farm for money that belongs
 * to neither. Money the Owner has not approved is counted, as it has moved, and counted apart as well.
 */
export const summariseMoney = (
  events: readonly MoneyToSummarise[]
): MoneySummary => {
  const all = new Map<"all", InAndOut>();
  const awaiting = new Map<"awaiting", InAndOut>();
  const byCategory = new Map<string, InAndOut>();
  const categoryNames = new Map<string, string | null>();
  const byCounterparty = new Map<string | null, InAndOut>();
  const bySide = new Map<Side | null, InAndOut>();
  let awaitingCount = 0;
  for (const money of events) {
    tally(all, "all", money.direction, money.amountBdt);
    if (money.awaitingApproval) {
      awaitingCount += 1;
      tally(awaiting, "awaiting", money.direction, money.amountBdt);
    }
    tally(byCategory, money.categoryBn, money.direction, money.amountBdt);
    categoryNames.set(money.categoryBn, money.categoryEn);
    tally(byCounterparty, money.counterpartyName, money.direction, money.amountBdt);
    for (const share of money.sides) {
      tally(bySide, share.side, money.direction, share.amountBdt);
    }
  }
  const totals = rounded(all.get("all") ?? { inBdt: 0, outBdt: 0 });
  return {
    incomeBdt: totals.inBdt,
    expenseBdt: totals.outBdt,
    netBdt: roundTaka(totals.inBdt - totals.outBdt),
    byCategory: [...byCategory.entries()]
      .map(([nameBn, line]) => ({
        nameBn,
        nameEn: categoryNames.get(nameBn) ?? null,
        ...rounded(line),
      }))
      .toSorted((a, b) => a.nameBn.localeCompare(b.nameBn)),
    byCounterparty: [...byCounterparty.entries()]
      .map(([name, line]) => ({ name, ...rounded(line) }))
      .toSorted((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    bySide: SIDE_ORDER.flatMap((side) => {
      const line = bySide.get(side);
      return line ? [{ side, ...rounded(line) }] : [];
    }),
    awaiting: {
      count: awaitingCount,
      ...rounded(awaiting.get("awaiting") ?? { inBdt: 0, outBdt: 0 }),
    },
  };
};
