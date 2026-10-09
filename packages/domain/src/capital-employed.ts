import type { Side } from "./lifecycle";
import { roundMoney } from "./money";

/** One Animal the Farm owned at a moment, as her cost is read: what it took to take her on, and her charges. */
export interface CapitalAnimal {
  /** The Side she stood on at the moment. */
  side: Side;
  /** Her price, the Internal Sale's that brought her back, nothing bred here; null for one the Owner never priced. */
  takenOnMoney: number | null;
  /** The Farm's own charges on her since it took her on, each when it fell. */
  charges: readonly { at: Date; amount: number }[];
  /** When she first calved: after it, a dairy animal's keep is the milk's cost and not capital. */
  firstCalvedAt: Date | null;
}

/**
 * The Farm's own money tied up at a moment, at cost (CONTEXT.md: **Capital Employed**; ADR 0023): each fattening
 * Animal standing at her price and every charge to her before it — she is stock; each dairy Animal standing at her entry
 * price and what she was charged until she first calved, or so far — she is the herd; the Farm Capital in Ventures still
 * running, the store and what buyers owe. Cash is not among it. One never priced counts nothing, and is counted.
 */
export const capitalEmployedOf = ({
  at,
  animals,
  venturesMoney,
  storeMoney,
  receivablesMoney,
}: {
  at: Date;
  animals: readonly CapitalAnimal[];
  venturesMoney: number;
  storeMoney: number;
  receivablesMoney: number;
}) => {
  const costOf = (animal: CapitalAnimal) => {
    const until =
      animal.side === "dairy" &&
      animal.firstCalvedAt !== null &&
      animal.firstCalvedAt < at
        ? animal.firstCalvedAt
        : at;
    return (
      (animal.takenOnMoney ?? 0) +
      animal.charges
        .filter((one) => one.at < until)
        .reduce((sum, one) => sum + one.amount, 0)
    );
  };
  const onSide = (side: Side) =>
    roundMoney(
      animals
        .filter((one) => one.side === side)
        .reduce((sum, one) => sum + costOf(one), 0)
    );
  const dairyMoney = onSide("dairy");
  const fatteningMoney = onSide("fattening");
  return {
    dairyMoney,
    fatteningMoney,
    venturesMoney,
    storeMoney,
    receivablesMoney,
    totalMoney: roundMoney(
      dairyMoney +
        fatteningMoney +
        venturesMoney +
        storeMoney +
        receivablesMoney
    ),
    /** Dairy animals standing with no price the Owner entered: counted at nothing above. */
    unpricedDairy: animals.filter(
      (one) => one.side === "dairy" && one.takenOnMoney === null
    ).length,
  };
};

export type CapitalEmployed = ReturnType<typeof capitalEmployedOf>;

/** So much over a mean of two, for every hundred, to one decimal; nothing over no capital. */
const per100 = (made: number, start: number, end: number): number | null => {
  const mean = (start + end) / 2;
  return mean > 0 ? Math.round((made / mean) * 1000) / 10 : null;
};

/** The capital the Farm's own Sides work with: all of it but the Ventures', whose return comes at Settlement. */
const ownCapitalOf = (capital: CapitalEmployed) =>
  capital.totalMoney - capital.venturesMoney;

/**
 * What a month's capital made, for every hundred taka (CONTEXT.md: **Capital Employed**): each Side's Result after
 * Overheads over the mean of its capital at the month's start and end; the Farm's over all of its capital but the
 * Ventures', whose return comes at Settlement and never in a month. Never put a year: a month of a Season says little
 * of its whole.
 */
export const monthsReturnOf = (
  afterOverheads: { dairy: number; fattening: number; farm: number },
  start: CapitalEmployed,
  end: CapitalEmployed
) => ({
  dairyPer100: per100(afterOverheads.dairy, start.dairyMoney, end.dairyMoney),
  fatteningPer100: per100(
    afterOverheads.fattening,
    start.fatteningMoney,
    end.fatteningMoney
  ),
  farmPer100: per100(
    afterOverheads.farm,
    ownCapitalOf(start),
    ownCapitalOf(end)
  ),
});

export type MonthsReturn = ReturnType<typeof monthsReturnOf>;
