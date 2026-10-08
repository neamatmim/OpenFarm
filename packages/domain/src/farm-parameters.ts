import { FEWEST_KEEP_READ_DAYS } from "./animal-price";
import { FEWEST_CALF_MILK_DAYS, fewestDaysBeforeMilkIsWeighed } from "./cull";

/**
 * Who may tune a Farm Parameter besides the Owner. Left out, the Manager sets it as the Owner does. "to set": the
 * Manager reads it but only the Owner changes it — what the keep-or-sell figures and the culling list read, and the
 * checks on the Manager himself. "to set and read": the Manager neither changes nor sees it — a Venture's own figures,
 * and the lines past which his counts are told to the Owner, which he could stay under if he knew them.
 */
export type OwnersAlone = "to set" | "to set and read";

/** What the farm will accept for one Farm Parameter: a whole number within its bounds, and who may set it. */
export interface ParameterBounds {
  min: number;
  max: number;
  ownersAlone?: OwnersAlone;
}

/**
 * The Farm Parameters that are numbers: each said once, with the bounds the farm will accept and who may set it. The
 * server's input check, its refusals of what is the Owner's, the audit's "before" and the settings form's bounds are
 * all read from here. A new Parameter is a column on the farm (its default lives there), a line here, and its words.
 */
export const FARM_PARAMETERS = {
  /** How far the tank reading may sit from what the cows account for before the Manager
   *  is asked to look. */
  milkTolerancePercent: { min: 0, max: 100 },
  feedTolerancePercent: { min: 0, max: 100 },
  /** How long a Shed Phone sits untouched before it locks and asks for a PIN again: long enough for a cow milked
   *  by hand, short enough that a phone left in the shed is nobody's for long. */
  pinAutoLockMinutes: { min: 1, max: 60 },
  /** How long an Overdue Instance may stay open before the Owner is told as well. The Owner's to set: lowered or raised
   *  by the Manager, the Owner would hear of his late work when he chose (the Owner's decision of 2026-10-07). */
  escalationMinutes: { min: 0, max: 24 * 60, ownersAlone: "to set" },
  /** How long after making an entry Staff may still put it right. */
  staffCorrectionHours: { min: 0, max: 24 * 7 },
  /** How long after an entry was made the Manager may still put it right. */
  managerCorrectionDays: { min: 0, max: 365, ownersAlone: "to set" },
  /** How early the farm is told its DLS registration is running out. */
  registrationRenewalLeadDays: { min: 0, max: 365 },
  /** How early the Manager is told a Lot of medicine or feed is running out of date. */
  expiryWarnDays: { min: 1, max: 365 },
  /** What a bought-in fattening animal is fed towards unless the Manager says otherwise
   *  for that animal. */
  fatteningTargetWeightKg: { min: 1, max: 2000 },
  /** How many days before Eid day 1 an animal aimed at it is suggested for sale: none at all is the day itself, and
   *  more than two months is no longer the haat before Eid. */
  readyLeadDays: { min: 0, max: 60 },
  /** How many days back a fattening animal's gain is read against her Ration's Expected Gain: at least two
   *  fortnightly Weigh-ins, and no more than three months, past which it is last season's Ration being judged. */
  gainReadDays: { min: 14, max: 90 },
  /** The shares of a Ration's Expected Gain a deshi animal and a cow or heifer are judged against: never above what
   *  the Ration is written for, and not so far under it that a bull gaining nothing still looks fine. */
  deshiGainPercent: { min: 30, max: 100 },
  femaleGainPercent: { min: 30, max: 100 },
  /** Under what share of her penmates' middle gain a fattening animal is pointed out: under half would miss nearly
   *  every slow one, and at the whole half of every Pen would be. */
  penGainPercent: { min: 50, max: 95 },
  /** The AI window after a Heat, in hours. */
  aiWindowStartHours: { min: 0, max: 72 },
  aiWindowEndHours: { min: 1, max: 96 },
  /** The days from an attempt's first service to its Pregnancy Check — not before a vet can
   *  tell, and not so late that a cow who did not take has missed two heats. */
  pregnancyCheckAfterDays: { min: 28, max: 90 },
  /** How long a cow carries, which Expected Calving is worked out from. Within what cattle do. */
  gestationDays: { min: 260, max: 300 },
  /** How long before her Expected Calving a cow is dried off, and walked to the calving pen. */
  dryOffLeadDays: { min: 30, max: 90 },
  calvingPrepLeadDays: { min: 1, max: 30 },
  /** How many attempts that did not take raise a Repeat Breeder. */
  repeatBreederThreshold: { min: 2, max: 10 },
  /** How many days back an animal's keep is read, for keep-or-sell and the culling list: at least a fortnight, and no
   *  more than three months, past which it is last season's Ration that is being read. */
  keepReadDays: { min: FEWEST_KEEP_READ_DAYS, max: 90, ownersAlone: "to set" },
  /** How many days ahead keeping a fattening animal is worked for keep-or-sell: at least a week, and no more than
   *  three months, past which her rate and her keep today say little about the days they are worked over. */
  keepAheadDays: { min: 7, max: 90, ownersAlone: "to set" },
  /** How many days an animal must have been here before her keep is judged: at least one, and no more than four
   *  weeks — which the handler also holds under the days this farm reads a keep over. */
  keepNeedsDays: { min: 1, max: 28, ownersAlone: "to set" },
  /** How many days apart her last two Weigh-ins must be before their gain is trusted for keep-or-sell: at least one,
   *  and no more than four weeks, past which a fortnightly weighing would never be read. */
  keepRateGapDays: { min: 1, max: 28, ownersAlone: "to set" },
  /** How many days after calving a cow still not in calf is named for culling: not before a cow that is going to
   *  settle has had her chances, and not past a year, when the question has long been answered. */
  cullOpenDays: { min: 60, max: 365, ownersAlone: "to set" },
  /** How many days into her Lactation before a cow's milk is weighed against her keep: never before her calf's days
   *  and the days her keep is read over after them — which the handler holds against the farm's own — and not past
   *  half a year, when the question has long been answered. */
  cullMilkAfterDays: {
    min: fewestDaysBeforeMilkIsWeighed(
      FEWEST_KEEP_READ_DAYS,
      FEWEST_CALF_MILK_DAYS
    ),
    max: 180,
    ownersAlone: "to set",
  },
  /** How many days after calving a cow's milk is her calf's: at least her first day, and no more than a month, past
   *  which a calf is drinking from a bucket, not from her mother. */
  cullCalfMilkDays: {
    min: FEWEST_CALF_MILK_DAYS,
    max: 30,
    ownersAlone: "to set",
  },
  /** How many days back the Dispatches are read for what a liter fetches: at least a week of a milk buyer, and no
   *  more than a year, past which the price is last year's. */
  cullMilkPriceDays: { min: 7, max: 365, ownersAlone: "to set" },
  /** The fewest days money must have been tied up, on average, before a return is put a year: at least one, and no
   *  more than a year, past which nothing a Season does would ever be scaled. */
  returnYearFloorDays: { min: 1, max: 365, ownersAlone: "to set" },
  /** The taka above which a Money Event waits for the Owner. */
  approvalThresholdMoney: { min: 0, max: 100_000_000, ownersAlone: "to set" },
  /** The day of the month from which a Monthly Cost with nothing entered that month is named: no later than the 28th,
   *  which every month has. */
  monthlyCostsFromDay: { min: 1, max: 28, ownersAlone: "to set" },
  /** How many days a Receivable with no promised day may run before it is overdue: a week at the least, four months at
   *  the most. */
  receivableDays: { min: 7, max: 120, ownersAlone: "to set" },
  /** The taka a Stock Count may come up short by before the Owner and the Manager are told of it. */
  storeShortfallTellMoney: {
    min: 0,
    max: 1_000_000,
    ownersAlone: "to set and read",
  },
  /** How many animals in one Pen with sores on the mouth or feet, within how many hours, before the farm is told. */
  soresTellAnimals: { min: 2, max: 20 },
  soresTellHours: { min: 12, max: 168 },
  /** How many Diagnoses within how many days put an animal on the Manager's list as ill again and again. */
  illAgainDiagnoses: { min: 2, max: 20 },
  illAgainDays: { min: 30, max: 730 },
  /** The day after calving from which an open cow with no heat seen is on the heat watch. */
  heatWatchAfterCalvingDays: { min: 30, max: 150 },
  /** The age a heifer should have been served by, crossbred and deshi. */
  firstServiceMonths: { min: 10, max: 36 },
  deshiFirstServiceMonths: { min: 12, max: 48 },
  /** How far under her own week a cow's milk must fall, over how many days, before she is named as giving less. */
  milkDropPercent: { min: 5, max: 80 },
  milkDropDays: { min: 1, max: 5 },
  /** How much of a week's milk may go unaccounted for before the Owner and the Manager are told. */
  milkUnaccountedPercent: { min: 1, max: 50, ownersAlone: "to set and read" },
  /** How many days an animal may be Missing before the Owner is asked whether to write her off as Lost. */
  missingWriteOffDays: { min: 1, max: 90, ownersAlone: "to set" },
  /** How far a Feed Purchase's price per unit may rise on the last one before the Owner is told. */
  feedPriceJumpPercent: { min: 1, max: 100, ownersAlone: "to set and read" },
  /** How far under her arrival weight a bought animal's first Weigh-in may come before the Owner is told. */
  arrivalShortPercent: { min: 1, max: 50, ownersAlone: "to set and read" },
  /** What the farm allows Shrink to take off a bull before the Owner is told, and what a Sale's floor allows for. */
  shrinkTellPercent: { min: 1, max: 30, ownersAlone: "to set and read" },
  /** How many days of a feed left, at the rate it is fed, before it is Running Low. */
  feedDaysLow: { min: 1, max: 60 },
  /** How many days after a Release or an arrival dose is put off it is raised again. */
  putOffDays: { min: 1, max: 60 },
  /** How far a Cash Count may come up short before the Owner is told. */
  cashShortTellMoney: {
    min: 0,
    max: 1_000_000,
    ownersAlone: "to set and read",
  },
  medicineShortTellMoney: {
    min: 0,
    max: 1_000_000,
    ownersAlone: "to set and read",
  },
  /** What part of a Venture's target capital is the least worth starting on. */
  ventureFloorPercent: { min: 0, max: 100, ownersAlone: "to set and read" },
  /** What part of a Venture's capital keeps the animals rather than buying them. */
  ventureRunningPercent: { min: 0, max: 90, ownersAlone: "to set and read" },
  /** Where a new Investment Agreement's split starts. A default, never a rule. */
  ventureInvestorsPercent: { min: 0, max: 100, ownersAlone: "to set and read" },
  /** The days a Venture keeps selling after its window before the Farm buys the rest. */
  windUpDays: { min: 0, max: 180, ownersAlone: "to set and read" },
  /** How old her last Weigh-in may be for an Internal Sale or the buy-back to price her on. */
  priceWeighInDays: { min: 1, max: 60, ownersAlone: "to set and read" },
  adjustmentThresholdMoney: {
    min: 0,
    max: 1_000_000,
    ownersAlone: "to set and read",
  },
  /** How many Investors the Farm may have at a time, and where it starts warning. */
  investorCap: { min: 1, max: 50, ownersAlone: "to set and read" },
  investorWarnAt: { min: 1, max: 50, ownersAlone: "to set and read" },
  runningBudgetWarnMoney: {
    min: 0,
    max: 100_000_000,
    ownersAlone: "to set and read",
  },
} as const satisfies Record<string, ParameterBounds>;

/** The name of one of the Farm Parameters that are numbers. */
export type FarmParameter = keyof typeof FARM_PARAMETERS;

/** The Parameters the Owner alone sets and reads, as a type: what a Manager's copy of the farm's settings leaves out. */
export type OwnersAloneToRead = {
  [Key in FarmParameter]: (typeof FARM_PARAMETERS)[Key] extends {
    readonly ownersAlone: "to set and read";
  }
    ? Key
    : never;
}[FarmParameter];

/** The Farm Parameters that are times of day rather than numbers, checked as times by the server. */
export const TIME_PARAMETERS = [
  "digestTimes",
  "quietFrom",
  "quietUntil",
] as const;

/** Every Farm Parameter, numbers and times. */
export const ALL_FARM_PARAMETERS = [
  ...(Object.keys(FARM_PARAMETERS) as FarmParameter[]),
  ...TIME_PARAMETERS,
] as const;

/** The Parameters whose bounds say the Owner alone may set them, or set and read them. */
export const parametersOwnersAlone = (
  which: OwnersAlone | "either"
): FarmParameter[] =>
  (Object.keys(FARM_PARAMETERS) as FarmParameter[]).filter((key) => {
    const said = (FARM_PARAMETERS[key] as ParameterBounds).ownersAlone;
    return which === "either" ? said !== undefined : said === which;
  });

/** The Parameters the Owner alone sets and reads, by name. */
export const parametersOwnersAloneRead = (): OwnersAloneToRead[] =>
  parametersOwnersAlone("to set and read") as OwnersAloneToRead[];
