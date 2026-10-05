// The Farm's own capital in a Venture (built 2026-10-05 on Claude's recommendation, at the Owner's word): what its own
// Units bring back at Settlement, as the Farm's books read it.

/**
 * What the Farm's own Units' payout is on the Farm's books: its capital coming home — all of it, or short of it where the
 * run lost — and, where the run made money, its share of the profit on that capital as income. One payout, two
 * Money Events, so a Venture's whole proceeds are never read as the Farm's earnings.
 */
export const farmsOwnPayout = ({
  capitalMoney,
  payoutMoney,
}: {
  capitalMoney: number;
  payoutMoney: number;
}): { capitalBackMoney: number; returnMoney: number } => ({
  capitalBackMoney: Math.min(capitalMoney, payoutMoney),
  returnMoney: Math.max(0, payoutMoney - capitalMoney),
});
