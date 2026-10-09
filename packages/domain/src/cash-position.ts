import { roundMoney } from "./money";

/**
 * What the Farm held of its own money at a moment (CONTEXT.md: **Cash Position**; ADR 0023): every note in the hands
 * less the Ventures' — their sale cash not yet deposited and their Buying Floats still out, never the Farm's to spend —
 * and each Farm Account's worked-out balance. An account not yet read once has no figure to start from: it counts
 * nothing, and is counted so the figure can say so.
 */
export const cashPositionOf = ({
  hands,
  accounts,
}: {
  hands: { allMoney: number; venturesMoney: number };
  /** Each Farm Account's balance then; nothing for one never read by then. */
  accounts: readonly (number | null)[];
}) => {
  const farmsInHandsMoney = roundMoney(hands.allMoney - hands.venturesMoney);
  const inAccountsMoney = roundMoney(
    accounts.reduce<number>((sum, one) => sum + (one ?? 0), 0)
  );
  return {
    inHandsMoney: roundMoney(hands.allMoney),
    venturesInHandsMoney: roundMoney(hands.venturesMoney),
    farmsInHandsMoney,
    inAccountsMoney,
    accountsNotRead: accounts.filter((one) => one === null).length,
    farmsOwnMoney: roundMoney(farmsInHandsMoney + inAccountsMoney),
  };
};

export type CashPosition = ReturnType<typeof cashPositionOf>;

/**
 * A stretch's cash flow: where the Farm's own money began, what came in and went out of its purse, and where it ended
 * — with the difference, what moved without passing a hand or an account the farm names: a Cash Count's difference,
 * money booked to nobody's hand, an account read for the first time. Shown, never hidden, so the four always add up.
 */
export const cashFlowOf = (
  opening: CashPosition,
  closing: CashPosition,
  money: { inMoney: number; outMoney: number }
) => ({
  openingMoney: opening.farmsOwnMoney,
  inMoney: money.inMoney,
  outMoney: money.outMoney,
  differenceMoney: roundMoney(
    closing.farmsOwnMoney -
      opening.farmsOwnMoney -
      money.inMoney +
      money.outMoney
  ),
  closingMoney: closing.farmsOwnMoney,
});

export type CashFlow = ReturnType<typeof cashFlowOf>;
