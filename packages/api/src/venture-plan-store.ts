import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { venturePlan, venturePlanLine } from "@OpenFarm/db/schema/venture";
import type { PlanLine } from "@OpenFarm/domain";
import {
  baselineOf,
  buyingAgainstPlan,
  planTotals,
  plannedHeadKg,
  plannedResult,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { theirSpend } from "./investor-statement-store";
import { projectionOf } from "./projection-store";
import { boughtFor } from "./venture-bought";
import { theirProgress } from "./venture-herd-store";
import type { VentureRow } from "./venture-store";

/**
 * A Venture's **Venture Plan**, read and written: every version the Owner saved, oldest first, the one in force (the
 * latest) and the one it is measured against (its baseline), each with what it comes to. Never a term of any
 * Agreement, and nobody's but the Owner's.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The days a plan's animals are fed: from buying, once it stops gathering capital, to the window's first day. */
const daysOnFeedOf = (run: { decideBy: string; targetWindowStart: string }) =>
  Math.round(
    (startOfFarmDay(run.targetWindowStart).getTime() -
      startOfFarmDay(run.decideBy).getTime()) /
      DAY_MS
  );

/** Every version of a Venture's plan, oldest first, with its lines in the order the Owner wrote them. */
const versionsOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
) => {
  const rows = await db.query.venturePlan.findMany({
    where: { farmId, ventureId },
    orderBy: { version: "asc" },
    with: { lines: { orderBy: { position: "asc" } } },
  });
  return rows.map((one) => ({
    version: one.version,
    madeWhile: one.madeWhile,
    madeAt: one.madeAt,
    reason: one.reason,
    saleLowBdtPerKg: one.saleLowBdtPerKg,
    saleHighBdtPerKg: one.saleHighBdtPerKg,
    deathsPercent: Number(one.deathsPercent),
    lines: one.lines.map((line): PlanLine => ({
      animals: line.animals,
      fromKg: Number(line.fromKg),
      toKg: Number(line.toKg),
      buyBdtPerKg: line.buyBdtPerKg,
      dailyGainKg: Number(line.dailyGainKg),
    })),
  }));
};

/** A Venture's plan as the Owner reads it: every version, the latest in force, and the baseline, with their totals. */
export const planOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  run: Pick<
    VentureRow,
    "id" | "decideBy" | "targetWindowStart" | "cattleBudgetBdt"
  >
) => {
  const versions = await versionsOf(db, farmId, run.id);
  const daysOnFeed = daysOnFeedOf(run);
  const withTotals = (one: (typeof versions)[number] | undefined) =>
    one
      ? {
          ...one,
          totals: planTotals({
            lines: one.lines,
            cattleBudgetBdt: run.cattleBudgetBdt,
            daysOnFeed,
          }),
        }
      : null;
  const baseline = baselineOf(versions);
  return {
    daysOnFeed,
    versions: versions.map(({ version, madeWhile, madeAt, reason }) => ({
      version,
      madeWhile,
      madeAt,
      reason,
    })),
    latest: withTotals(versions.at(-1)),
    baseline: withTotals(versions.find((one) => one.version === baseline)),
  };
};

/** What a new version of a plan says. */
export interface PlanSaid {
  lines: PlanLine[];
  saleLowBdtPerKg: number;
  saleHighBdtPerKg: number;
  /** The share of its animals it expects not to live to be sold, in per cent. */
  deathsPercent: number;
  reason: string | null;
}

/**
 * Saves a new version of a Venture's plan: while it is Open, as often as the Owner likes; once buying has begun, only
 * with a reason — it is a revision, and the baseline stays the plan made before. Refused once it is settled or called
 * off, when there is nothing left to plan.
 */
export const savePlan = async (
  tx: Tx,
  farmId: string,
  run: Pick<VentureRow, "id" | "state">,
  said: PlanSaid,
  by: { userId: string | null; at: Date }
) => {
  if (run.state === "settled" || run.state === "cancelled") {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture that has ended has nothing left to plan",
      data: { refusal: "plan_after_the_end" },
    });
  }
  if (run.state !== "open" && !said.reason) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A plan changed after buying began says why",
      data: { refusal: "plan_revision_needs_reason" },
    });
  }
  const last = await tx.query.venturePlan.findFirst({
    where: { farmId, ventureId: run.id },
    orderBy: { version: "desc" },
    columns: { version: true },
  });
  const planId = uuidv7();
  const version = (last?.version ?? 0) + 1;
  await tx.insert(venturePlan).values({
    id: planId,
    farmId,
    ventureId: run.id,
    version,
    madeWhile: run.state,
    saleLowBdtPerKg: said.saleLowBdtPerKg,
    saleHighBdtPerKg: said.saleHighBdtPerKg,
    deathsPercent: said.deathsPercent.toFixed(2),
    reason: run.state === "open" ? null : said.reason,
    madeAt: by.at,
    madeBy: by.userId,
  });
  await tx.insert(venturePlanLine).values(
    said.lines.map((line, position) => ({
      id: uuidv7(),
      farmId,
      planId,
      position,
      animals: line.animals,
      fromKg: line.fromKg.toFixed(2),
      toKg: line.toKg.toFixed(2),
      buyBdtPerKg: line.buyBdtPerKg,
      dailyGainKg: line.dailyGainKg.toFixed(2),
    }))
  );
  return { version };
};

/**
 * A Venture measured against the plan it opened on — its baseline, not the latest revision: what it bought in each
 * band beside what the plan meant to buy there, and anything bought outside every band; what a head weighs today
 * beside what the plan said it would by now; and the money — the cattle the plan costed against what the animals
 * cost, the running budget against what has been spent, and what the plan said it would make against what it is now
 * projected to. Nothing while it has no plan. The Owner's alone.
 */
export const planAgainstActual = async (
  db: Database,
  farmId: string,
  /** The Venture as its row holds it, with when it was opened, which its Settlement is read from. */
  run: VentureRow & { createdAt: Date },
  offeredPercent: number,
  now: Date
) => {
  const plan = await planOf(db, farmId, run);
  const { baseline } = plan;
  if (!baseline) {
    return null;
  }
  const bought = await boughtFor(db, farmId, run.id);
  const buying = buyingAgainstPlan(baseline.lines, bought);
  const [progress, spend, projected] = await Promise.all([
    theirProgress(db, farmId, run, now),
    theirSpend(db, farmId, run),
    projectionOf(db, farmId, run, offeredPercent, now),
  ]);
  const daysSinceBuying = Math.min(
    plan.daysOnFeed,
    Math.floor(
      (now.getTime() - startOfFarmDay(run.decideBy).getTime()) / DAY_MS
    )
  );
  const plannedRunningBdt = run.targetCapitalBdt - run.cattleBudgetBdt;
  return {
    baselineVersion: baseline.version,
    buying,
    growth: {
      daysSinceBuying: Math.max(0, daysSinceBuying),
      plannedKgToday: plannedHeadKg(baseline.lines, daysSinceBuying),
      /** The average of the standing animals weighed since they came; nothing while none has been. */
      actualKgToday: progress.averageLatestKg,
      weighed: progress.weighedCount,
      plannedKgAtWindow: plannedHeadKg(baseline.lines, plan.daysOnFeed),
    },
    money: {
      plannedCattleBdt: baseline.totals.costBdt,
      boughtBdt: buying.total.costBdt,
      plannedRunningBdt,
      runningSpentBdt: spend.runningSpentBdt,
      planned: plannedResult({
        saleKg: baseline.totals.saleKg,
        cattleBdt: baseline.totals.costBdt,
        runningBudgetBdt: plannedRunningBdt,
        saleLowBdtPerKg: baseline.saleLowBdtPerKg,
        saleHighBdtPerKg: baseline.saleHighBdtPerKg,
        deathsPercent: baseline.deathsPercent,
      }),
      /** What it is projected to make now, worked from its plan in force; nothing once it has ended. */
      projected: projected
        ? {
            lowBdt: projected.low.profitBdt,
            highBdt: projected.high.profitBdt,
          }
        : null,
    },
  };
};
