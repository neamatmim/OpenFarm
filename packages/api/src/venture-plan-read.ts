import type { PlanLine } from "@OpenFarm/domain";

import type { Tx } from "./audit";

/**
 * A Venture's **Venture Plan** as the database holds it, read in one place: each version with its lines in the order
 * the Owner wrote them, as the plan's arithmetic takes them. Both the plan and the projection worked from it read here,
 * so a column added to a plan is read once.
 */

/** One saved version of a plan. */
export interface PlanVersion {
  version: number;
  madeWhile: string;
  madeAt: Date;
  reason: string | null;
  saleLowBdtPerKg: number;
  saleHighBdtPerKg: number;
  /** The share of its animals it expects not to live to be sold, in per cent. */
  deathsPercent: number;
  lines: PlanLine[];
}

const WITH_LINES = { lines: { orderBy: { position: "asc" } } } as const;

/** A plan row with its lines, as the database hands it over: numeric columns as text. */
interface Row {
  version: number;
  madeWhile: string;
  madeAt: Date;
  reason: string | null;
  saleLowBdtPerKg: number;
  saleHighBdtPerKg: number;
  deathsPercent: string;
  lines: {
    animals: number;
    fromKg: string;
    toKg: string;
    buyBdtPerKg: number;
    dailyGainKg: string;
  }[];
}

const versionOf = (row: Row): PlanVersion => ({
  version: row.version,
  madeWhile: row.madeWhile,
  madeAt: row.madeAt,
  reason: row.reason,
  saleLowBdtPerKg: row.saleLowBdtPerKg,
  saleHighBdtPerKg: row.saleHighBdtPerKg,
  deathsPercent: Number(row.deathsPercent),
  lines: row.lines.map((line): PlanLine => ({
    animals: line.animals,
    fromKg: Number(line.fromKg),
    toKg: Number(line.toKg),
    buyBdtPerKg: line.buyBdtPerKg,
    dailyGainKg: Number(line.dailyGainKg),
  })),
});

/** Every version of a Venture's plan, oldest first. */
export const plansOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<PlanVersion[]> => {
  const rows = await db.query.venturePlan.findMany({
    where: { farmId, ventureId },
    orderBy: { version: "asc" },
    with: WITH_LINES,
  });
  return rows.map(versionOf);
};

/** The version of a Venture's plan in force: the latest saved. Nothing while it has none. */
export const latestPlanOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<PlanVersion | null> => {
  const row = await db.query.venturePlan.findFirst({
    where: { farmId, ventureId },
    orderBy: { version: "desc" },
    with: WITH_LINES,
  });
  return row ? versionOf(row) : null;
};
