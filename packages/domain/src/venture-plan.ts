import { roundTaka } from "./money";

/**
 * The arithmetic of a **Venture Plan**: what the Owner means to buy — lines by weight band, each so many animals at so
 * much a kilo, putting on so much a day — and what that comes to. The plan a Venture is measured against, never a term
 * of any Agreement.
 */

/** One line of a plan: so many animals bought between two weights, at a price a kilo, gaining so much a day. */
export interface PlanLine {
  animals: number;
  /** The band's weights at purchase: the lower one in, the upper one out. */
  fromKg: number;
  toKg: number;
  buyBdtPerKg: number;
  dailyGainKg: number;
}

/** Kilogrammes, as the farm reads a weight. */
const roundKg = (value: number) => Math.round(value * 10) / 10;

/** A line bought at the middle of its band: the weight it is planned at when nothing more exact is said. */
const middleOf = (line: PlanLine) => (line.fromKg + line.toKg) / 2;

/**
 * What each line and the whole plan come to: the kilos bought and what they cost, what each head weighs by the window
 * at its own gain, and by how much the plan spends past the cattle budget — said, never refused: the Owner may mean
 * to.
 */
export const planTotals = ({
  lines,
  cattleBudgetBdt,
  daysOnFeed,
}: {
  lines: readonly PlanLine[];
  cattleBudgetBdt: number;
  /** From buying to the window's first day; none past it. */
  daysOnFeed: number;
}) => {
  const days = Math.max(0, daysOnFeed);
  const each = lines.map((line) => {
    const boughtKg = roundKg(line.animals * middleOf(line));
    const saleKgEach = roundKg(middleOf(line) + line.dailyGainKg * days);
    return {
      boughtKg,
      costBdt: roundTaka(boughtKg * line.buyBdtPerKg),
      saleKgEach,
      saleKg: roundKg(saleKgEach * line.animals),
    };
  });
  const costBdt = roundTaka(each.reduce((sum, one) => sum + one.costBdt, 0));
  return {
    lines: each,
    animals: lines.reduce((sum, line) => sum + line.animals, 0),
    boughtKg: roundKg(each.reduce((sum, one) => sum + one.boughtKg, 0)),
    costBdt,
    saleKg: roundKg(each.reduce((sum, one) => sum + one.saleKg, 0)),
    overBudgetBdt: Math.max(0, roundTaka(costBdt - cattleBudgetBdt)),
  };
};

/** Which line of the plan an animal bought at this weight belongs to, by position; none outside every band. */
export const bandOf = (
  lines: readonly Pick<PlanLine, "fromKg" | "toKg">[],
  weightKg: number
): number | null => {
  const at = lines.findIndex(
    (line) => weightKg >= line.fromKg && weightKg < line.toKg
  );
  return at === -1 ? null : at;
};

/**
 * The version a Venture is measured against: the last one saved while it was still gathering capital — what it
 * promised itself before a taka went on cattle — or, for a plan first made later, the first one there is.
 */
export const baselineOf = (
  versions: readonly { version: number; madeWhile: string }[]
): number | null => {
  const beforeBuying = versions.filter((one) => one.madeWhile === "open");
  const last = beforeBuying.at(-1);
  if (last) {
    return last.version;
  }
  return versions.at(0)?.version ?? null;
};
