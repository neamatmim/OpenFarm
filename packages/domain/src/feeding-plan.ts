import type { ExpectedGain } from "./expected-gain";
import { farmDaysApart } from "./farm-clock";
import { addDays } from "./fattening";
import type { RationLine, WeightBand } from "./feed";
import { bandStanding, isByWeight, roundKg } from "./feed";

/** Immutable ration contents, band and animal-adjusted gain at the time a plan was approved. */
export interface PlannedRation {
  rationId: string;
  versionId: string;
  nameBn: string;
  nameEn: string | null;
  band: WeightBand;
  gain: ExpectedGain | null;
  items: RationLine[];
}

export interface FeedingPlan {
  startDay: string;
  startWeightKg: number;
  saleDay: string;
  targetWeightKg: number;
  adaptationDays: number;
  transitionDays: number;
  reviewDays: number;
  reservePercent: number;
  arrival: PlannedRation | null;
  stages: PlannedRation[];
}

export const FEED_PLAN_SCENARIOS = ["slow", "expected", "fast"] as const;
export type FeedPlanScenario = (typeof FEED_PLAN_SCENARIOS)[number];
export const MAX_FEED_PLAN_DAYS = 540;

export interface PlanFeedAmount {
  feedItemId: string;
  quantity: number;
}
export interface PlanMonth {
  month: string;
  days: number;
  fromKg: number;
  toKg: number;
  feeds: PlanFeedAmount[];
}
export interface PlanReview {
  day: string;
  weightKg: number;
  rationId: string;
  nameBn: string;
  nameEn: string | null;
}
export interface PlanForecast {
  scenario: FeedPlanScenario;
  endWeightKg: number | null;
  months: PlanMonth[];
  feeds: PlanFeedAmount[];
  reviews: PlanReview[];
  stopped: { day: string; weightKg: number; reason: "gap" | "overlap" } | null;
}

/** Refuse ambiguous ladders rather than silently choosing one of two rations. */
export const feedingPlanProblems = (plan: FeedingPlan): string[] => {
  const problems: string[] = [];
  const days = farmDaysApart(plan.startDay, plan.saleDay);
  if (!Number.isFinite(days) || days < 1 || days > MAX_FEED_PLAN_DAYS) {
    problems.push("duration");
  }
  if (plan.adaptationDays > 0 && !plan.arrival) {
    problems.push("arrival");
  }
  if (plan.stages.length === 0) {
    problems.push("stages");
  }
  const stages = plan.stages.toSorted(
    (a, b) => (a.band.fromKg ?? 0) - (b.band.fromKg ?? 0)
  );
  let previousTo = 0;
  for (const [index, stage] of stages.entries()) {
    const from = stage.band.fromKg ?? 0;
    const to = stage.band.toKg ?? Number.POSITIVE_INFINITY;
    if (from >= to || from < previousTo) {
      problems.push("overlap");
    }
    if (index > 0 && from > previousTo) {
      problems.push("gap");
    }
    if (!stage.gain || stage.items.length === 0) {
      problems.push("stageIncomplete");
    }
    previousTo = to;
  }
  return [...new Set(problems)];
};

const amountsOf = (amounts: Map<string, number>): PlanFeedAmount[] =>
  [...amounts].map(([feedItemId, quantity]) => ({ feedItemId, quantity }));

const addFeed = (
  amounts: Map<string, number>,
  id: string,
  quantity: number
) => {
  amounts.set(id, (amounts.get(id) ?? 0) + quantity);
};

const rateOf = (
  gain: ExpectedGain | null,
  scenario: FeedPlanScenario
): number => {
  if (!gain) {
    return 0;
  }
  if (scenario === "slow") {
    return gain.lowKg;
  }
  return scenario === "fast" ? gain.highKg : (gain.lowKg + gain.highKg) / 2;
};

interface ForecastMonth {
  days: number;
  fromKg: number;
  toKg: number;
  feeds: Map<string, number>;
}
interface RationPart {
  ration: PlannedRation;
  share: number;
}

const rationAtWeight = (
  plan: FeedingPlan,
  kg: number,
  at: string
): PlannedRation[] => {
  if (at < addDays(plan.startDay, plan.adaptationDays) && plan.arrival) {
    return [plan.arrival];
  }
  return plan.stages.filter((stage) => bandStanding(kg, stage.band) === "fits");
};

const accumulateDay = (
  months: Map<string, ForecastMonth>,
  totals: Map<string, number>,
  at: string,
  kg: number,
  parts: RationPart[]
): ForecastMonth => {
  const name = at.slice(0, 7);
  let month = months.get(name);
  if (!month) {
    month = {
      days: 0,
      fromKg: roundKg(kg),
      toKg: roundKg(kg),
      feeds: new Map(),
    };
    months.set(name, month);
  }
  month.days += 1;
  for (const part of parts) {
    for (const line of part.ration.items) {
      const quantity =
        (isByWeight(line)
          ? (line.kgPer100KgPerDay * kg) / 100
          : line.kgPerAnimalPerDay) * part.share;
      addFeed(month.feeds, line.feedItemId, quantity);
      addFeed(totals, line.feedItemId, quantity);
    }
  }
  return month;
};

const transitionParts = (
  ration: PlannedRation,
  from: PlannedRation | null,
  days: number,
  age: number
): RationPart[] => {
  const share = from && days > 0 ? Math.min(1, age / days) : 1;
  return from && share < 1
    ? [
        { ration, share },
        { ration: from, share: 1 - share },
      ]
    : [{ ration, share: 1 }];
};

/**
 * Feed is accumulated at each day's projected weight, with raw precision until presentation. The sale day is excluded.
 * Every band crossing is a review suggestion, not a pen assignment. Transitions blend old/new amounts over the
 * manager's chosen days. During adaptation the planning assumption is zero gain, not a prediction of actual growth.
 * A missing band stops the scenario and makes its final weight unknown; partial demand is never called a full plan.
 */
export const forecastFeedingPlan = (
  plan: FeedingPlan,
  scenario: FeedPlanScenario,
  {
    day = plan.startDay,
    weightKg = plan.startWeightKg,
    includeFrom = day,
  }: {
    day?: string;
    weightKg?: number;
    includeFrom?: string;
  } = {}
): PlanForecast => {
  const result: PlanForecast = {
    scenario,
    endWeightKg: null,
    months: [],
    feeds: [],
    reviews: [],
    stopped: null,
  };
  const totals = new Map<string, number>();
  const months = new Map<string, ForecastMonth>();
  const adaptationUntil = addDays(plan.startDay, plan.adaptationDays);
  let kg = plan.startWeightKg;
  let previous: PlannedRation | null = null;
  let blendingFrom: PlannedRation | null = null;
  let transitionAt = day;
  const days = Math.min(
    Math.max(0, farmDaysApart(plan.startDay, plan.saleDay)),
    MAX_FEED_PLAN_DAYS
  );
  for (let offset = 0; offset < days; offset += 1) {
    const at = addDays(plan.startDay, offset);
    if (at === day) {
      kg = weightKg;
    }
    const adapting = at < adaptationUntil && plan.arrival !== null;
    const matches = rationAtWeight(plan, kg, at);
    const [ration] = matches;
    if (!ration || matches.length !== 1) {
      result.stopped = {
        day: at,
        weightKg: roundKg(kg),
        reason: matches.length > 1 ? "overlap" : "gap",
      };
      break;
    }
    if (previous?.rationId !== ration.rationId) {
      blendingFrom = previous;
      transitionAt = at;
      previous = ration;
      if (at >= includeFrom) {
        result.reviews.push({
          day: at,
          weightKg: roundKg(kg),
          rationId: ration.rationId,
          nameBn: ration.nameBn,
          nameEn: ration.nameEn,
        });
      }
    }
    const transitionAge = farmDaysApart(transitionAt, at) + 1;
    const parts = transitionParts(
      ration,
      blendingFrom,
      plan.transitionDays,
      transitionAge
    );
    const month =
      at >= includeFrom ? accumulateDay(months, totals, at, kg, parts) : null;
    if (!adapting) {
      for (const part of parts) {
        kg += rateOf(part.ration.gain, scenario) * part.share;
      }
    }
    if (month) {
      month.toKg = roundKg(kg);
    }
  }
  const finalWeight = day === plan.saleDay ? weightKg : kg;
  result.endWeightKg = result.stopped ? null : roundKg(finalWeight);
  result.feeds = amountsOf(totals);
  result.months = [...months].map(([month, value]) => ({
    ...value,
    month,
    feeds: amountsOf(value.feeds),
  }));
  return result;
};

/** A purchasing allowance rounds upward in the feed's unit; totals never lose a small mineral requirement. */
export const plannedQuantity = (quantity: number, unit: string): number => {
  if (quantity <= 0) {
    return 0;
  }
  return unit === "bundle"
    ? Math.ceil(quantity)
    : Math.ceil((quantity - 1e-9) * 100) / 100;
};
