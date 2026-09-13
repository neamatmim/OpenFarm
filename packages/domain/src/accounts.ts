import type { Side } from "./lifecycle";
import { roundTaka } from "./money";

/** One Money Event as the accountant's summary adds it up. */
export interface MoneyToSummarise {
  direction: "in" | "out";
  amountBdt: number;
  categoryBn: string;
  categoryEn: string | null;
  counterpartyName: string | null;
  /** The Side it belongs to; null for the whole farm. */
  side: Side | null;
  awaitingApproval: boolean;
}

interface InAndOut {
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
  /** Money in the period the Owner has not yet approved: in the sums, and said. */
  awaiting: { count: number; amountBdt: number };
}

const SIDE_ORDER: (Side | null)[] = ["dairy", "fattening", null];

/** Adds one Money Event into the running in-and-out for its key. */
const tally = <K>(
  totals: Map<K, InAndOut>,
  key: K,
  money: MoneyToSummarise
): void => {
  const running = totals.get(key) ?? { inBdt: 0, outBdt: 0 };
  if (money.direction === "in") {
    running.inBdt += money.amountBdt;
  } else {
    running.outBdt += money.amountBdt;
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
  const byCategory = new Map<string, InAndOut>();
  const categoryNames = new Map<string, string | null>();
  const byCounterparty = new Map<string | null, InAndOut>();
  const bySide = new Map<Side | null, InAndOut>();
  let incomeBdt = 0;
  let expenseBdt = 0;
  let awaitingCount = 0;
  let awaitingBdt = 0;
  for (const money of events) {
    if (money.direction === "in") {
      incomeBdt += money.amountBdt;
    } else {
      expenseBdt += money.amountBdt;
    }
    if (money.awaitingApproval) {
      awaitingCount += 1;
      awaitingBdt += money.amountBdt;
    }
    tally(byCategory, money.categoryBn, money);
    categoryNames.set(money.categoryBn, money.categoryEn);
    tally(byCounterparty, money.counterpartyName, money);
    tally(bySide, money.side, money);
  }
  return {
    incomeBdt: roundTaka(incomeBdt),
    expenseBdt: roundTaka(expenseBdt),
    netBdt: roundTaka(incomeBdt - expenseBdt),
    byCategory: [...byCategory.entries()]
      .map(([nameBn, totals]) => ({
        nameBn,
        nameEn: categoryNames.get(nameBn) ?? null,
        ...rounded(totals),
      }))
      .toSorted((a, b) => a.nameBn.localeCompare(b.nameBn)),
    byCounterparty: [...byCounterparty.entries()]
      .map(([name, totals]) => ({ name, ...rounded(totals) }))
      .toSorted((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    bySide: SIDE_ORDER.flatMap((side) => {
      const totals = bySide.get(side);
      return totals ? [{ side, ...rounded(totals) }] : [];
    }),
    awaiting: { count: awaitingCount, amountBdt: roundTaka(awaitingBdt) },
  };
};
