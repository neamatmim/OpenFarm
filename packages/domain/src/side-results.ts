import { roundMoney } from "./money";

/** One Side's month, or the Farm's (CONTEXT.md: **Side Result**). */
export interface SideResult {
  /** The Dairy side's milk sold; the Fattening side's sale prices of the animals sold. */
  broughtInMoney: number;
  /** What it brought in less what its animals were charged: the Fattening side's is its sold animals' Margins. */
  beforeOverheadsMoney: number;
  /** Its share of the month's Overheads, by the days its animals stood here; the Farm's is all of them. */
  overheadsMoney: number;
  afterOverheadsMoney: number;
  /** Each over what it brought in, a percentage to one decimal; nothing where nothing came in. */
  marginBeforePercent: number | null;
  marginAfterPercent: number | null;
}

/** A part of a whole, as a percentage to one decimal; nothing over nothing. */
const percentOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

const resultOf = (
  broughtInMoney: number,
  beforeOverheadsMoney: number,
  overheadsMoney: number
): SideResult => {
  const afterOverheadsMoney = roundMoney(beforeOverheadsMoney - overheadsMoney);
  return {
    broughtInMoney,
    beforeOverheadsMoney,
    overheadsMoney,
    afterOverheadsMoney,
    marginBeforePercent: percentOf(beforeOverheadsMoney, broughtInMoney),
    marginAfterPercent: percentOf(afterOverheadsMoney, broughtInMoney),
  };
};

/**
 * What each Side of the Farm's own came to in a month, and the Farm with them (CONTEXT.md: **Side Result**; ADR 0023):
 * what it brought in less its charges — the Dairy side's milk against the month's charges to its animals, the
 * Fattening side's sold animals' Margins against their sale prices — then less its share of the Overheads, their
 * amount by the days its own animals stood on it over every day every animal stood here. The Ventures' animals' days
 * are the Farm's to bear, said as the rest, so the shares add up to the Overheads; where no animal stood at all, the
 * rest is all of them. The Farm's is both Sides' before the Overheads, less the whole of them.
 */
export const sideResultsOf = ({
  dairy,
  fattening,
  overheadsMoney,
  headDays,
}: {
  dairy: { broughtInMoney: number; chargedMoney: number };
  /** Nothing for the Margins where no animal was sold. */
  fattening: { broughtInMoney: number; marginMoney: number | null };
  overheadsMoney: number;
  headDays: { dairy: number; fattening: number; ventures: number };
}) => {
  const allDays = headDays.dairy + headDays.fattening + headDays.ventures;
  const shareOf = (days: number) =>
    allDays === 0 ? 0 : roundMoney((overheadsMoney * days) / allDays);
  const dairyShare = shareOf(headDays.dairy);
  const fatteningShare = shareOf(headDays.fattening);
  const dairyBefore = roundMoney(dairy.broughtInMoney - dairy.chargedMoney);
  const fatteningBefore = fattening.marginMoney ?? 0;
  return {
    dairy: resultOf(dairy.broughtInMoney, dairyBefore, dairyShare),
    fattening: resultOf(
      fattening.broughtInMoney,
      fatteningBefore,
      fatteningShare
    ),
    /** The Overheads the Ventures' animals' days come to — or all of them, where no animal stood: the Farm's to bear. */
    restOfOverheadsMoney: roundMoney(
      overheadsMoney - dairyShare - fatteningShare
    ),
    farm: resultOf(
      roundMoney(dairy.broughtInMoney + fattening.broughtInMoney),
      roundMoney(dairyBefore + fatteningBefore),
      overheadsMoney
    ),
  };
};

export type SideResults = ReturnType<typeof sideResultsOf>;
