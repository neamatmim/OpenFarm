import { roundTaka } from "./money";
import { livingKg } from "./projection";

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

/** Some animals added up: how many, their kilos, what they cost, and so a kilo; no price a kilo for none. */
const addUp = (bought: readonly { weightKg: number; priceBdt: number }[]) => {
  const kg = roundKg(bought.reduce((sum, one) => sum + one.weightKg, 0));
  const costBdt = roundTaka(bought.reduce((sum, one) => sum + one.priceBdt, 0));
  return {
    animals: bought.length,
    kg,
    costBdt,
    bdtPerKg: kg > 0 ? roundTaka(costBdt / kg) : null,
  };
};

/**
 * What a Venture bought against its plan, band by band: each line planned — animals, kilos at the middle of its band,
 * what they cost and so a kilo — beside the animals actually bought at a weight inside it; and apart, any bought
 * outside every band, which the plan did not expect.
 */
export const buyingAgainstPlan = (
  lines: readonly PlanLine[],
  bought: readonly { weightKg: number; priceBdt: number }[]
) => {
  const inBand = lines.map(
    () => [] as { weightKg: number; priceBdt: number }[]
  );
  const outside: { weightKg: number; priceBdt: number }[] = [];
  for (const one of bought) {
    const at = bandOf(lines, one.weightKg);
    if (at === null) {
      outside.push(one);
    } else {
      inBand[at]?.push(one);
    }
  }
  return {
    bands: lines.map((line, at) => {
      const kg = roundKg(line.animals * middleOf(line));
      return {
        planned: {
          animals: line.animals,
          kg,
          costBdt: roundTaka(kg * line.buyBdtPerKg),
          bdtPerKg: line.buyBdtPerKg,
        },
        bought: addUp(inBand[at] ?? []),
      };
    }),
    outside: addUp(outside),
    total: addUp(bought),
  };
};

/** What the plan says a head weighs so many days after buying: each band from its middle at its own gain, the herd
 *  weighed by its animals. Nothing is put on before they are bought. */
export const plannedHeadKg = (
  lines: readonly PlanLine[],
  daysSinceBuying: number
): number => {
  const days = Math.max(0, daysSinceBuying);
  const animals = lines.reduce((sum, line) => sum + line.animals, 0);
  if (animals === 0) {
    return 0;
  }
  const kg = lines.reduce(
    (sum, line) =>
      sum + line.animals * (middleOf(line) + line.dailyGainKg * days),
    0
  );
  return roundKg(kg / animals);
};

/** What the plan says the Venture makes at the low and the high sale price: the herd's weight at sale, sold, less the
 *  cattle it buys and the whole of its running budget — at the low end with the share it expects to die not sold, and
 *  still paid for. Before the Investors' split. */
export const plannedResult = ({
  saleKg,
  cattleBdt,
  runningBudgetBdt,
  saleLowBdtPerKg,
  saleHighBdtPerKg,
  deathsPercent = 0,
}: {
  saleKg: number;
  cattleBdt: number;
  runningBudgetBdt: number;
  saleLowBdtPerKg: number;
  saleHighBdtPerKg: number;
  deathsPercent?: number;
}) => {
  const spent = cattleBdt + runningBudgetBdt;
  return {
    lowBdt: roundTaka(
      livingKg(saleKg, deathsPercent) * saleLowBdtPerKg - spent
    ),
    highBdt: roundTaka(saleKg * saleHighBdtPerKg - spent),
  };
};
