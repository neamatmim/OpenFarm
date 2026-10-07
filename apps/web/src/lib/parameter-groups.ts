import type { FarmParameter, TIME_PARAMETERS } from "@OpenFarm/domain";
import { FARM_PARAMETERS, parametersOwnersAlone } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";

/** One of the farm's settings the form offers: a number, or a time of day. */
export type ParameterKey = FarmParameter | (typeof TIME_PARAMETERS)[number];

/** One box on the form: which setting, the words around it, and whether it is a time. Its bounds and whether it is the
 *  Owner's are the setting's own (domain `FARM_PARAMETERS`), not the form's. */
export interface FieldSpec {
  key: ParameterKey;
  label: MessageKey;
  unit?: MessageKey;
  time?: boolean;
  /** What the farm's own animals say of this share, beneath it. */
  farmsOwn?: "deshi" | "female";
}

/** The Parameters in the groups a Manager thinks of them in, each with what it is for. */
const LAID_OUT: {
  id: string;
  title: MessageKey;
  hint: MessageKey;
  /** A group whose figures the Standards and sources page explains, linked beneath what it is for. */
  sourced?: boolean;
  fields: FieldSpec[];
}[] = [
  {
    id: "params-alerts",
    title: "params.alerts",
    hint: "params.alertsHint",
    fields: [
      { key: "digestTimes", label: "params.digestTimes" },
      { key: "quietFrom", label: "params.quietFrom", time: true },
      { key: "quietUntil", label: "params.quietUntil", time: true },
      {
        key: "expiryWarnDays",
        label: "params.expiryWarn",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-records",
    title: "params.records",
    hint: "params.recordsHint",
    fields: [
      {
        key: "milkTolerancePercent",
        label: "params.milkTolerance",
        unit: "params.percent",
      },
      {
        key: "feedTolerancePercent",
        label: "params.feedTolerance",
        unit: "params.percent",
      },
      {
        key: "pinAutoLockMinutes",
        label: "params.pinAutoLock",
        unit: "params.minutes",
      },
      {
        key: "staffCorrectionHours",
        label: "params.staffCorrection",
        unit: "params.hours",
      },
    ],
  },
  {
    id: "params-checks",
    title: "params.checks",
    hint: "params.checksHint",
    // The checks on the Manager himself are the Owner's to set (the Owner's decision of 2026-10-04).
    fields: [
      {
        key: "escalationMinutes",
        label: "params.escalation",
        unit: "params.minutes",
      },
      {
        key: "managerCorrectionDays",
        label: "params.managerCorrection",
        unit: "params.days",
      },
      {
        key: "approvalThresholdMoney",
        label: "params.approvalThreshold",
        unit: "params.money",
      },
    ],
  },
  {
    id: "params-keep-and-cull",
    title: "params.keepAndCull",
    hint: "params.keepAndCullHint",
    fields: [
      {
        key: "keepReadDays",
        label: "params.keepReadDays",
        unit: "params.days",
      },
      {
        key: "keepAheadDays",
        label: "params.keepAheadDays",
        unit: "params.days",
      },
      {
        key: "keepNeedsDays",
        label: "params.keepNeedsDays",
        unit: "params.days",
      },
      {
        key: "keepRateGapDays",
        label: "params.keepRateGapDays",
        unit: "params.days",
      },
      {
        key: "cullOpenDays",
        label: "params.cullOpenDays",
        unit: "params.days",
      },
      {
        key: "cullMilkAfterDays",
        label: "params.cullMilkAfterDays",
        unit: "params.days",
        // The server holds it a week past the days this farm reads a keep over; this is only the soonest any farm may
        // have.
      },
      {
        key: "cullCalfMilkDays",
        label: "params.cullCalfMilkDays",
        unit: "params.days",
      },
      {
        key: "cullMilkPriceDays",
        label: "params.cullMilkPriceDays",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-monthly-costs",
    title: "params.monthlyCosts",
    hint: "params.monthlyCostsHint",
    fields: [
      {
        key: "monthlyCostsFromDay",
        label: "params.monthlyCostsFromDay",
        // The 28th is the last day every month has.
      },
    ],
  },
  {
    id: "params-receivable",
    title: "params.receivable",
    hint: "params.receivableHint",
    fields: [
      {
        key: "receivableDays",
        label: "params.receivableDays",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-sores",
    title: "params.sores",
    hint: "params.soresHint",
    fields: [
      {
        key: "soresTellAnimals",
        label: "params.soresTellAnimals",
        unit: "params.animals",
      },
      {
        key: "soresTellHours",
        label: "params.soresTellHours",
        unit: "params.hours",
      },
    ],
  },
  {
    id: "params-heat-watch",
    title: "params.heatWatch",
    hint: "params.heatWatchHint",
    fields: [
      {
        key: "heatWatchAfterCalvingDays",
        label: "params.heatWatchAfterCalvingDays",
        unit: "params.days",
      },
      {
        key: "firstServiceMonths",
        label: "params.firstServiceMonths",
        unit: "params.months",
      },
      {
        key: "deshiFirstServiceMonths",
        label: "params.deshiFirstServiceMonths",
        unit: "params.months",
      },
    ],
  },
  {
    id: "params-milk-drop",
    title: "params.milkDrop",
    hint: "params.milkDropHint",
    fields: [
      {
        key: "milkDropPercent",
        label: "params.milkDropPercent",
        unit: "params.percent",
      },
      {
        key: "milkDropDays",
        label: "params.milkDropDays",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-milk-unaccounted",
    title: "params.milkUnaccounted",
    hint: "params.milkUnaccountedHint",
    fields: [
      {
        key: "milkUnaccountedPercent",
        label: "params.milkUnaccountedPercent",
        unit: "params.percent",
      },
    ],
  },
  {
    id: "params-cash-short",
    title: "params.cashShort",
    hint: "params.cashShortHint",
    fields: [
      {
        key: "cashShortTellMoney",
        label: "params.cashShortTellMoney",
        unit: "params.money",
      },
    ],
  },
  {
    id: "params-medicine-short",
    title: "params.medicineShort",
    hint: "params.medicineShortHint",
    fields: [
      {
        key: "medicineShortTellMoney",
        label: "params.medicineShortTellMoney",
        unit: "params.money",
      },
    ],
  },
  {
    id: "params-feed-days",
    title: "params.feedDays",
    hint: "params.feedDaysHint",
    fields: [
      {
        key: "feedDaysLow",
        label: "params.feedDaysLow",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-put-off",
    title: "params.putOff",
    hint: "params.putOffHint",
    fields: [
      {
        key: "putOffDays",
        label: "params.putOffDays",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-feed-price",
    title: "params.feedPrice",
    hint: "params.feedPriceHint",
    fields: [
      {
        key: "feedPriceJumpPercent",
        label: "params.feedPriceJumpPercent",
        unit: "params.percent",
      },
    ],
  },
  {
    id: "params-arrival-short",
    title: "params.arrivalShort",
    hint: "params.arrivalShortHint",
    fields: [
      {
        key: "arrivalShortPercent",
        label: "params.arrivalShortPercent",
        unit: "params.percent",
      },
    ],
  },
  {
    id: "params-shrink",
    title: "params.shrink",
    hint: "params.shrinkHint",
    fields: [
      {
        key: "shrinkTellPercent",
        label: "params.shrinkTellPercent",
        unit: "params.percent",
      },
    ],
  },
  {
    id: "params-missing",
    title: "params.missing",
    hint: "params.missingHint",
    fields: [
      {
        key: "missingWriteOffDays",
        label: "params.missingWriteOffDays",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-ill-again",
    title: "params.illAgain",
    hint: "params.illAgainHint",
    fields: [
      {
        key: "illAgainDiagnoses",
        label: "params.illAgainDiagnoses",
        unit: "params.diagnoses",
      },
      {
        key: "illAgainDays",
        label: "params.illAgainDays",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-store-shortfall",
    title: "params.storeShortfall",
    hint: "params.storeShortfallHint",
    fields: [
      {
        key: "storeShortfallTellMoney",
        label: "params.storeShortfallTellMoney",
        unit: "params.money",
      },
    ],
  },
  {
    id: "params-returns",
    title: "params.returns",
    hint: "params.returnsHint",
    fields: [
      {
        key: "returnYearFloorDays",
        label: "params.returnYearFloorDays",
        unit: "params.days",
      },
    ],
  },
  {
    id: "params-ventures",
    title: "params.ventures",
    hint: "params.venturesHint",
    fields: [
      {
        key: "ventureFloorPercent",
        label: "params.ventureFloor",
        unit: "params.percent",
      },
      {
        key: "ventureRunningPercent",
        label: "params.ventureRunning",
        unit: "params.percent",
      },
      {
        key: "ventureInvestorsPercent",
        label: "params.ventureInvestors",
        unit: "params.percent",
      },
      {
        key: "windUpDays",
        label: "params.windUp",
        unit: "params.days",
      },
      {
        key: "priceWeighInDays",
        label: "params.priceWeighIn",
        unit: "params.days",
      },
      {
        key: "adjustmentThresholdMoney",
        label: "params.adjustmentThreshold",
        unit: "params.money",
      },
      {
        key: "investorCap",
        label: "params.investorCap",
        unit: "params.people",
      },
      {
        key: "investorWarnAt",
        label: "params.investorWarnAt",
        unit: "params.people",
      },
      {
        key: "runningBudgetWarnMoney",
        label: "params.runningBudgetWarn",
        unit: "params.money",
      },
    ],
  },
  {
    id: "params-breeding",
    title: "params.breeding",
    hint: "params.breedingHint",
    fields: [
      {
        key: "aiWindowStartHours",
        label: "params.aiWindowStart",
        unit: "params.hours",
      },
      {
        key: "aiWindowEndHours",
        label: "params.aiWindowEnd",
        unit: "params.hours",
      },
      {
        key: "pregnancyCheckAfterDays",
        label: "params.pregnancyCheck",
        unit: "params.days",
      },
      {
        key: "gestationDays",
        label: "params.gestation",
        unit: "params.days",
      },
      {
        key: "dryOffLeadDays",
        label: "params.dryOffLead",
        unit: "params.days",
      },
      {
        key: "calvingPrepLeadDays",
        label: "params.calvingPrepLead",
        unit: "params.days",
      },
      {
        key: "repeatBreederThreshold",
        label: "params.repeatBreeder",
        unit: "params.attempts",
      },
    ],
  },
  {
    id: "params-fattening",
    title: "params.fatteningAndPapers",
    hint: "params.fatteningAndPapersHint",
    sourced: true,
    fields: [
      {
        key: "fatteningTargetWeightKg",
        label: "params.fatteningTarget",
        unit: "params.kg",
      },
      {
        key: "readyLeadDays",
        label: "params.readyLeadDays",
        unit: "params.days",
      },
      {
        key: "gainReadDays",
        label: "params.gainReadDays",
        unit: "params.days",
      },
      {
        key: "deshiGainPercent",
        label: "params.deshiGainPercent",
        unit: "params.percent",
        farmsOwn: "deshi",
      },
      {
        key: "femaleGainPercent",
        label: "params.femaleGainPercent",
        unit: "params.percent",
        farmsOwn: "female",
      },
      {
        key: "penGainPercent",
        label: "params.penGainPercent",
        unit: "params.percent",
      },
      {
        key: "registrationRenewalLeadDays",
        label: "params.renewalLead",
        unit: "params.days",
      },
    ],
  },
];

const isANumber = (key: ParameterKey): key is FarmParameter =>
  Object.hasOwn(FARM_PARAMETERS, key);

/** The figures a setting takes, as the farm declares them; nothing for a time of day. */
export const boundsOf = (
  key: ParameterKey
): { min: number; max: number } | null => {
  if (!isANumber(key)) {
    return null;
  }
  const { min, max } = FARM_PARAMETERS[key];
  return { min, max };
};

const theOwners = new Set<ParameterKey>(parametersOwnersAlone("either"));

/** The groups on the form, each the Owner's alone where its settings are: a Manager is not offered them. */
export const PARAMETER_GROUPS = LAID_OUT.map((group) => ({
  ...group,
  owner: group.fields.some((field) => theOwners.has(field.key)),
}));

/** The parts of the Parameters, for a page that lists what is on it — and which are the Owner's, so the list does not
 *  offer the Manager a jump to a part that is not drawn for them. */
export const PARAMETER_SECTIONS = PARAMETER_GROUPS.map(
  ({ id, title, owner }) => ({ id, title, owner })
);
