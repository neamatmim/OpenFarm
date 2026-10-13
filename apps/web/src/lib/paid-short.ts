/**
 * Whether the Owner's "Paid" figure for one investor on a Venture is said in the warning's color. Paid before buying,
 * until it agrees with what the Units are worth. Paid by the month, only once a Monthly Sum is missed: nobody reaches
 * the whole price before the last sum, and a cell colored for that all season would hide the one who is behind. While
 * the Venture gathers its sums have no standing yet, and the Cattle Part has its own readiness check.
 */
export const paidLooksShort = (row: {
  paidMoney: number;
  owedMoney: number;
  monthly: boolean;
  sums?: { missedMoney: number } | null;
}): boolean =>
  row.monthly
    ? (row.sums?.missedMoney ?? 0) > 0
    : row.paidMoney !== row.owedMoney;
