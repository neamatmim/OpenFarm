import { isAFarmDay } from "@OpenFarm/domain";
import type { FeedingPlan } from "@OpenFarm/domain/feeding-plan";
import { feedingPlanProblems } from "@OpenFarm/domain/feeding-plan";
import type { MessageKey } from "@OpenFarm/i18n";

type NumericField =
  | "startWeightKg"
  | "targetWeightKg"
  | "adaptationDays"
  | "transitionDays"
  | "reviewDays"
  | "reservePercent";
interface Problem {
  message: MessageKey;
  at: string;
}
const NUMBERS: {
  field: NumericField;
  min: number;
  max: number;
  integer: boolean;
  problem: Problem;
}[] = [
  {
    field: "startWeightKg",
    min: 0.1,
    max: 2000,
    integer: false,
    problem: { message: "feedPlan.invalid.startWeight", at: "plan-weight" },
  },
  {
    field: "targetWeightKg",
    min: 0.1,
    max: 2000,
    integer: false,
    problem: { message: "feedPlan.invalid.targetWeight", at: "plan-target" },
  },
  {
    field: "adaptationDays",
    min: 0,
    max: 60,
    integer: true,
    problem: { message: "feedPlan.invalid.adaptation", at: "plan-adapt" },
  },
  {
    field: "transitionDays",
    min: 0,
    max: 30,
    integer: true,
    problem: { message: "feedPlan.invalid.transition", at: "plan-transition" },
  },
  {
    field: "reviewDays",
    min: 7,
    max: 90,
    integer: true,
    problem: { message: "feedPlan.invalid.review", at: "plan-review" },
  },
  {
    field: "reservePercent",
    min: 0,
    max: 50,
    integer: false,
    problem: { message: "feedPlan.invalid.reserve", at: "plan-reserve" },
  },
];
const STRUCTURE: Record<string, Problem> = {
  duration: { message: "feedPlan.invalid.duration", at: "plan-sale" },
  arrival: { message: "feedPlan.invalid.arrival", at: "plan-arrival" },
  stages: { message: "feedPlan.invalid.stages", at: "plan-stages" },
  overlap: { message: "feedPlan.invalid.overlap", at: "plan-stages" },
  gap: { message: "feedPlan.invalid.gap", at: "plan-stages" },
  stageIncomplete: {
    message: "feedPlan.invalid.stageIncomplete",
    at: "plan-stages",
  },
};
/** Keep the refusal and its field together, in the order the plan asks for them. */
export const feedingPlanIssue = (
  plan: FeedingPlan,
  typed: Record<NumericField, string>,
  today: string
): Problem | null => {
  if (!isAFarmDay(plan.startDay, { notAfter: today })) {
    return { message: "feedPlan.invalid.startDay", at: "plan-start" };
  }
  if (!isAFarmDay(plan.saleDay)) {
    return STRUCTURE.duration ?? null;
  }
  for (const { field, min, max, integer, problem } of NUMBERS) {
    const value = Number(typed[field]);
    if (
      !typed[field].trim() ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    ) {
      return problem;
    }
  }
  const [first] = feedingPlanProblems(plan);
  return first ? (STRUCTURE[first] ?? STRUCTURE.stages ?? null) : null;
};
