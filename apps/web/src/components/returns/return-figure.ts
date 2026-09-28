import type { MessageKey } from "@OpenFarm/i18n";

import type { client } from "@/utils/orpc";

/**
 * What a Return is said as, before it is drawn: whether a figure is a gain or a loss, the words each takes, and which of
 * a dairy run's figures she is read by. Plain functions, so the rule is tested without a page.
 */

export type ReturnsPage = Awaited<ReturnType<typeof client.returns.page>>;
export type Season = ReturnsPage["seasons"][number];
export type Venture = ReturnsPage["ventures"][number];
export type Returned = NonNullable<Season["returnOnCost"]>;
export type BankRateSaid = NonNullable<Season["bankRate"]>;
export type Running = NonNullable<Season["running"]>;
export type Gap = Season["gaps"][number];
export type Dairy = ReturnsPage["dairy"];
export type DairyRun = Dairy["standing"][number];
export type HeadRange = NonNullable<DairyRun["worthToday"]>;

/** Whether a figure is a loss: below nothing. Nought is said as a gain. */
export const isLoss = (figure: number): boolean => figure < 0;

/** The words for a figure that may be a gain or a loss, the gain's first: the figure itself is always said unsigned. */
export const SAID = {
  onCost: ["returns.onCostGain", "returns.onCostLoss"],
  onCapital: ["returns.onCapitalGain", "returns.onCapitalLoss"],
  perYear: ["returns.perYearGain", "returns.perYearLoss"],
  result: ["returns.made", "returns.lost"],
  gone: ["returns.goneMade", "returns.goneLost"],
  sinceSettlement: [
    "returns.sinceSettlementMore",
    "returns.sinceSettlementLess",
  ],
} as const satisfies Record<string, readonly [MessageKey, MessageKey]>;

/** Which of a pair of words a figure takes: the gain's at nought or above, the loss's below. */
export const wordFor = (
  pair: readonly [MessageKey, MessageKey],
  figure: number
): MessageKey => (isLoss(figure) ? pair[1] : pair[0]);

/** A range at today's price as words: made, lost, or from lost to made — every figure unsigned. */
export const todayRangeSaid = ({
  low: { per100: low },
  high: { per100: high },
}: Running):
  | { key: "returns.todayRangeGain"; params: { low: number; high: number } }
  | { key: "returns.todayRangeLoss"; params: { least: number; most: number } }
  | {
      key: "returns.todayRangeMixed";
      params: { loss: number; gain: number };
    } => {
  if (!isLoss(low)) {
    return { key: "returns.todayRangeGain", params: { low, high } };
  }
  if (isLoss(high)) {
    return {
      key: "returns.todayRangeLoss",
      params: { least: Math.abs(high), most: Math.abs(low) },
    };
  }
  return {
    key: "returns.todayRangeMixed",
    params: { loss: Math.abs(low), gain: high },
  };
};

/** Which figure a dairy run is read by: one choice, so her line on a list and her own page never say two things. */
export type DairyFigure =
  | { kind: "returned"; returned: Returned }
  | { kind: "result"; bdt: number }
  | { kind: "running"; running: Running }
  | { kind: "worth"; worth: HeadRange }
  | { kind: "none"; gaps: Gap[] };

/**
 * A dairy run's figure: once she has gone, her result with its share — or, where there is no share to say, as for a
 * calf who cost nothing and fetched nothing, her result alone; while she is here, her range — or, with nothing spent on
 * her yet, what a head of her kind would fetch; else why there is none. An answer this phone kept from before a run
 * carried its result or its worth has neither.
 */
export const dairyFigureOf = (run: DairyRun): DairyFigure => {
  if (run.returnOnCost) {
    return { kind: "returned", returned: run.returnOnCost };
  }
  const result = run.resultBdt ?? null;
  if (result !== null) {
    return { kind: "result", bdt: result };
  }
  if (run.running) {
    return { kind: "running", running: run.running };
  }
  const worth = run.worthToday ?? null;
  if (worth) {
    return { kind: "worth", worth };
  }
  return { kind: "none", gaps: run.gaps };
};
