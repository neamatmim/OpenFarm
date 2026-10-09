export type {
  AnimalState,
  Disposal,
  ExitState,
  LiveState,
  MortalityKind,
  Side,
} from "./lifecycle";
export {
  DISPOSALS,
  ENTRY_STATES,
  EXIT_STATES,
  LIVE_STATES,
  MORTALITY_KINDS,
  STILLBIRTH,
  SIDES,
  STATES,
  STATES as ANIMAL_STATES,
  allowedNextStates,
  canTransition,
  statesSetByHand,
  isExitState,
  isLiveState,
  sideOfState,
  stateAfterSideChange,
} from "./lifecycle";
export type {
  CalfOutcome,
  FailedBecause,
  RepeatBreederDecision,
  CalfSex,
  CalvingEase,
  CalvingLead,
  CalvingTooSoon,
  PregnancyCheckResult,
  ServiceMethod,
  HeatWatchBecause,
  HeatWatched,
  HeiferWatchBecause,
} from "./breeding";
export {
  CALF_OUTCOMES,
  CALF_SEXES,
  CALVING_EASES,
  CALVING_LEADS,
  CALVING_RECORDERS,
  REPEAT_BREEDER_DECISIONS,
  MAY_CALVE_FROM,
  HEAT,
  PREGNANCY_CHECK_RESULTS,
  SAME_HEAT_WITHIN_HOURS,
  SERVICE,
  SERVICE_METHODS,
  aiWindow,
  attemptOf,
  attemptsThatBegin,
  heatWatchOf,
  heiferWatchOf,
  RETURN_HEAT_FROM_DAYS,
  RETURN_HEAT_UNTIL_DAYS,
  attemptsThatFailed,
  calvingWorkDue,
  calvingTooSoon,
  calvingOverdueOf,
  CALVING_OVERDUE_DAYS,
  expectedCalvingFrom,
  failedAttempts,
  heatsThatBegin,
  isCalvingLead,
  isRepeatBreeder,
  sinceSheLastCalved,
  isPregnancyCheckResult,
  isServiceMethod,
} from "./breeding";
export type { FarmIdentity } from "./farm";
export type { RegistrationStanding } from "./farm";
export {
  goodUntilOf,
  identityView,
  registrationStanding,
  renewalOpensAt,
} from "./farm";
export {
  atFarmTime,
  farmDayOf,
  farmDaysApart,
  farmDaysBetween,
  farmTimeOf,
  startOfFarmDay,
} from "./farm-clock";
export type { Age, AgeAtIntake } from "./age";
export { ageOf, bornAroundOf } from "./age";
export type {
  FatteningView,
  GainBasis,
  TargetWindow,
  WeighIn,
} from "./fattening";
export {
  addDays,
  PLAUSIBLE_DAILY_GAIN_KG,
  PLAUSIBLE_DAILY_LOSS_KG,
  daysOnFeedOf,
  wholeDaysFrom,
  fatteningView,
  implausibleAfterArrival,
  implausibleChange,
} from "./fattening";
export type {
  ExpectedGain,
  FarmGainFigure,
  BreedShareFigure,
  GainAdjustment,
  GainJudged,
  MeasuredStay,
  GainGroup,
  GainOnRation,
  GainingBand,
  GainShares,
  GainStanding,
} from "./expected-gain";
export {
  BREED_GAIN_PERCENT,
  breedShareFigureOf,
  isBreedGainPercent,
  shareToUse,
  bullShareOf,
  FEWEST_FOR_A_FIGURE,
  GAIN_GROUPS,
  PEN_NEEDS_GAINS,
  GAIN_STANDINGS,
  SETTLING_IN_DAYS,
  expectedGainFor,
  farmGainFigureOf,
  findExpectedGainProblems,
  gainGroupOf,
  gainOverStayOf,
  gainShareOf,
  isUnderPenmates,
  penShareOf,
  gainingBandFor,
  grownWeightFor,
  gainCountsFrom,
  gainOnRationOf,
  gainStandingOf,
  isShortOfExpected,
} from "./expected-gain";
export type { EidBasis, EidWindow, ListedEid, Season } from "./eid";
export {
  EID_BASES,
  EID_UL_ADHA,
  QURBANI_DAYS,
  eidByTheCalendar,
  eidsListed,
  expectedEidNear,
  isSameEid,
  nextEidWindow,
  qurbaniFrom,
  seasonOf,
} from "./eid";
export type { CapitalIn, Returned, RunningRange, Spent } from "./returns";
export { returnOf, returnOnCapitalOf, runningRangeOf } from "./returns";
export type { ReadyReason } from "./ready";
export {
  READY_REASONS,
  readyGrounds,
  stillWorthSaying,
  windowHasClosed,
} from "./ready";
export type {
  HealthRegister,
  InspectorRegister,
  PaperOrganization,
  DocumentRow,
  Said,
  Worded,
} from "./papers";
export {
  INSPECTOR_REGISTERS,
  NO_GUARANTEE,
  NO_GUARANTEE_LINES,
  inLanguage,
} from "./papers";
export type { NotifiableLetter } from "./letter";
export { notifiableLetterPaper } from "./letter";
export type { TagPrefix } from "./tag-number";
export {
  TAG_PREFIXES,
  formatTagNumber,
  isTagNumber,
  parseTagNumber,
  prefixForOrigin,
} from "./tag-number";
export type {
  LactationSummary,
  LactationView,
  MilkDestination,
  MilkAccount,
  MilkDrop,
  MilkHold,
  Reconciliation,
} from "./milk";
export {
  LITER_DECIMALS,
  MILK_DESTINATIONS,
  daysInMilk,
  destinationFor,
  lactationSummary,
  lactationView,
  litersPerCowMilked,
  reconcile,
  litersTo,
  roundLiters,
  underMilkWithdrawal,
  milkHeldAt,
  MILK_ACCOUNT_DAYS,
  MILK_USUAL_DAYS,
  milkAccountOf,
  calvesDrankADay,
  milkDropOf,
} from "./milk";
export {
  PIN_LENGTH,
  derivePinHash,
  isPin,
  isTooEasyPin,
  randomPinSalt,
  verifyPin,
} from "./pin";
export {
  DEFAULT_AUTO_LOCK_MINUTES,
  SYNC_BATCH_MAX,
  SYNC_BATCH_MAX_BYTES,
  heavierThanAPhoneSends,
} from "./phone-limits";
export type { AlertKind, ReviewReason } from "./alerts";
export type {
  CorrectionRefusal,
  CorrectionVerdict,
  CorrectionWindows,
} from "./corrections";
export {
  DEFAULT_CORRECTION_WINDOWS,
  correctableUntil,
  describeWindow,
  mayCorrect,
} from "./corrections";
export { ALERT_KINDS, REVIEW_REASONS } from "./alerts";
export type { LotFacts, NoticeFacts, WorkFacts } from "./notice-facts";
export { hoursLate, noticeFilling } from "./notice-words";
export type { QuietHours } from "./notify";
export {
  DELIVERY,
  SAYS,
  carryingMoments,
  goesByText,
  goesNow,
  isQuiet,
  lastCarryingMoment,
  minutesInTheDay,
  waitsForTheDigest,
  wakesTheFarm,
} from "./notify";
export type { DueWork, InstanceState, WorkTransition } from "./work";
export {
  AWAITING_SIGN_OFF,
  INSTANCE_STATES,
  MAX_GRACE_MINUTES,
  OPEN_INSTANCE_STATES,
  WORK_TRANSITIONS,
  awaitsSignOff,
  isEscalated,
  isFinished,
  isOpen,
  isOverdue,
  maySignOff,
  mayTransition,
  minutesOverdue,
  stateAfter,
} from "./work";
export type {
  FeedingEntryLine,
  FeedingLine,
  BandStanding,
  LeftoverStanding,
  LeftoverTally,
  PurchasePrice,
  RationLine,
  SellerOnTheScale,
  StockMovement,
  WeighedAnimal,
  WeightBand,
} from "./feed";
export {
  KG_DECIMALS,
  MAX_KG_PER_100KG_PER_DAY,
  bandStanding,
  findBandProblems,
  MAX_KG_PER_ANIMAL_PER_DAY,
  SESSIONS_TO_JUDGE,
  WASTING_LEFTOVER_PERCENT,
  findRationProblems,
  isShortFed,
  lastFellBelow,
  leftoverPercent,
  leftoverStanding,
  maundsOf,
  herdWeightOf,
  isByWeight,
  perSessionKg,
  sessionKgOf,
  roundFeedKg,
  roundFeedTarget,
  roundKg,
  shortfallPercent,
  priceHistory,
  FEED_RATE_DAYS,
  daysLeftOf,
  fedPerDayOf,
  priceJumped,
  purchasePricesOf,
  scaleShortOf,
  sellersOnTheScale,
  shortfallOf,
  MAX_BAG_KG,
  SMALLEST_FEED_AMOUNT,
  FEED_IN_SHOWN,
  countedOverTheBook,
  stockLedger,
  unitPriceOf,
} from "./feed";
export type { AdultDeaths, HeadRecord, SideDeaths } from "./adult-deaths";
export { ADULT_DEATH_CAUSES, adultDeaths } from "./adult-deaths";
export type { Bought } from "./last-buys";
export { LAST_BUYS_DAYS, againstLastBuys, lastBuysPerKg } from "./last-buys";
export type {
  BreedingCycle,
  CowBreeding,
  CowSinceCalving,
  HerdFertility,
} from "./fertility";
export {
  FERTILITY_TARGETS,
  cowsSinceCalving,
  cyclesOf,
  herdFertility,
} from "./fertility";
export type { CheckSummary, WorkToCheck } from "./check-summary";
export { checkSummaryOf } from "./check-summary";
export type { Growth, GrowthHolding } from "./fattening-growth";
export { growthOf } from "./fattening-growth";
export type {
  Between,
  HerdBetween,
  VentureHolding,
} from "./venture-herd-as-of";
export { headsAt, herdBetween } from "./venture-herd-as-of";
export type { VentureMonthFacts, VentureMonthRow } from "./venture-month-paper";
export { ventureMonthPaper, ventureMonthRows } from "./venture-month-paper";
export type {
  CowStay,
  DairyTurnover,
  DiagnosisSeen,
  Sickness,
} from "./herd-turnover";
export {
  COMMON_DISEASES,
  MASTITIS,
  dairyTurnover,
  sicknessOf,
} from "./herd-turnover";
export type { LastFigureKind } from "./last-figure";
export { farFromLast, readsAgainstLast } from "./last-figure";
export type { BoughtIn, EarlyLosses } from "./early-losses";
export { EARLY_DAYS } from "./early-days";
export { weighedTooLongAgo } from "./priced-weighing";
export { earlyLosses } from "./early-losses";
export type { BoughtAt, ScaleReading } from "./arrival-weight";
export { weighedShort } from "./arrival-weight";
export type { ListedDisease } from "./disease-names";
export type { Shrink } from "./shrink";
export {
  SHRINK_STALE_DAYS,
  floorWeightOf,
  shrankPast,
  shrinkOf,
  shrinkOfMany,
} from "./shrink";
export { diseaseWord, namesTheDisease } from "./disease-names";
export type { IllAgain } from "./health";
export type {
  DoseHold,
  DoseRoute,
  NotPrescribable,
  WithdrawalDays,
  WithdrawalView,
} from "./health";
export {
  MAX_COURSE_DAYS,
  MAX_TIMES_A_DAY,
  MAX_WITHDRAWAL_DAYS,
  ROUTES,
  findWithdrawalProblems,
  holdInForce,
  illAgainOf,
  daysOfADoseNotPrescribed,
  mayBePrescribed,
  underMeatWithdrawal,
  whyNotPrescribable,
  WITHDRAWAL_LOOK_BACK_DAYS,
  withdrawalEndsAt,
  withdrawalView,
} from "./health";
export type { RoleName } from "./roles";
export { ROLES, aManagerMayInvite } from "./roles";
export type {
  AppliesTo,
  Bilingual,
  Choice,
  Evidence,
  EvidenceType,
  FarmEvent,
  SopChange,
  SkipMeaning,
  SkipReason,
  SopContent,
  Step,
  StepEffect,
  Trigger,
  TriggerKind,
} from "./sop";
export {
  EVIDENCE_TYPES,
  FARM_EVENTS,
  MAX_TRIGGER_OFFSET_DAYS,
  PHOTO_FILE_MAX_BYTES,
  outOfRangeOf,
  outsideItsRange,
  PHOTO_MAX_BYTES,
  THUMB_MAX_BYTES,
  SKIP_MEANINGS,
  STAYS_A_HEIFER,
  STEP_EFFECT_KINDS,
  TRIGGER_KINDS,
  CALVED,
  UNWELL,
  UNWELL_URGENT,
  appliesToAnimal,
  isWholeFarmWork,
  scheduleFallsOn,
  describeChanges,
  isClinicalStep,
  isHealthStep,
  isClosingStep,
  mayRaiseByHand,
  isOneTap,
  maySkip,
  meaningOfSkip,
  choiceSaid,
  WRITTEN_BY_MISTAKE,
  nothingToNoteOf,
  missingEvidence,
  raisesItsOwnWork,
  sessionsPerDayOf,
  findMissingBangla,
  findPublishBlockers,
  findStructuralProblems,
} from "./sop";
export type {
  ReceivableAtTheGate,
  ReceivableItem,
  ReceivableItemStanding,
  ReceivableKind,
  ReceivableOutcome,
  ReceivablePart,
  ReceivablePaymentIn,
  ReceivableRefusal,
  ReceivableStanding,
} from "./receivable";
export {
  RECEIVABLE_KINDS,
  RECEIVABLE_REFUSALS,
  receivableAtTheGate,
  receivableStanding,
  isReceivableOverdue,
  overdueFrom,
  soldOnCreditWhileOverdue,
  receivablePutRight,
  isReceivableRefusal,
  paidAtTheGate,
} from "./receivable";
export type {
  ApprovedTerms,
  EnteredBefore,
  MoneyApproval,
  PaymentMethod,
} from "./money";
export {
  PAYMENT_METHODS,
  approvalOf,
  looksEnteredAlready,
  roundMoney,
  termsUnchanged,
} from "./money";
export type {
  CostShare,
  Costs,
  FeedShare,
  Carried,
  FeedingToCost,
  HerdCostToSplit,
  OwnersOverTime,
  TripToSplit,
  UnallocatedFeeding,
  UnallocatedHerdCost,
  UnallocatedTrip,
} from "./costs";
export {
  PURCHASES_A_DOSE_IS_COSTED_OVER,
  costOfGainOf,
  costPerLiterOf,
  dosePriceOf,
  feedShares,
  herdShares,
  marginOf,
  monthOf,
  monthsEndingIn,
  roundedCosts,
  tripShares,
} from "./costs";
export type {
  FinancialYear,
  YearChange,
  YearChangeRefusal,
  YearRules,
} from "./financial-year";
export {
  financialYearOf,
  financialYearStarting,
  financialYearsBack,
  isYearStart,
  monthHasBegun,
  monthsOfFinancialYear,
  refusalOfChange,
  refusalOfWithdrawal,
  yearAfter,
  yearBefore,
} from "./financial-year";
export { groupedBy } from "./grouped-by";
export type {
  Charge,
  ChargeKind,
  Holding,
  Left,
  OwnedThenBy,
  WhatHappened,
} from "./holding";
export {
  CHARGE_KINDS,
  EVERY_CHARGE,
  HER_KEEP,
  WHAT_THE_FARM_IS_OWED,
  chargesInHolding,
  chargesOfOwner,
  costsOf,
  handedOverAt,
  howSheLeft,
} from "./holding";
export type {
  DairyAnimalRead,
  DairyBooks,
  DairyCame,
  DairyRun,
  DairyWent,
  HeadRange,
  LitersSent,
} from "./dairy-returns";
export {
  bredHere,
  dairyRunOf,
  herdNowOf,
  milkPricesByMonth,
} from "./dairy-returns";
export type {
  ApprovedSettlement,
  BankRate,
  BankRateSaid,
  CapitalMovement,
  Came,
  Gap,
  HoldingRead,
  JoinedHow,
  NotValued,
  ReturnBooks,
  SeasonHolding,
  SeasonReturn,
  VentureReturn,
} from "./cattle-returns";
export {
  backOf,
  bankRateFor,
  capitalOf,
  diedOrCulled,
  earliest,
  rateInForceOn,
  returnOfHoldings,
  spentOn,
  growthOfHoldings,
  seasonGroupsOf,
  seasonsOf,
  ventureReturnOf,
  whatHappenedTo,
} from "./cattle-returns";
export type {
  Arrival,
  ArrivalKind,
  Exit,
  PenHistoryLine,
  PenSpellOf,
} from "./pen-history";
export {
  ARRIVAL_MOVE_REASONS,
  ARRIVALS,
  arrivalFromMove,
  arrivalOf,
  covers,
  exitOf,
  penHistoryOf,
  penSpellsOf,
  sidesOverTime,
} from "./pen-history";
export type {
  InAndOut,
  MoneySummary,
  MoneyToSummarize,
  SideShare,
} from "./money-summary";
export { summarizeMoney } from "./money-summary";
export type {
  EnteredUnder,
  MonthlyCost,
  MonthlyCostNotEntered,
  WageNotEntered,
  WagePaid,
} from "./monthly-costs";
export { monthlyCostsNotEntered } from "./monthly-costs";
export type { OverheadMoney } from "./overheads";
export { headDaysBySide, headDaysIn, overheadsOver } from "./overheads";
export type { ObservationWord } from "./observation-words";
export {
  OBSERVATION_WORDS,
  OBSERVATION_WORD_NEEDING_A_NOTE,
  observationWordOf,
} from "./observation-words";
export type {
  ChoiceSlot,
  DateTimeSlot,
  Held,
  NoteSlot,
  RepeatName,
  Repeated,
  Slot,
  SlotName,
  SlotNamed,
  StepShape,
  TurnOf,
  WordsFor,
} from "./step-shape";
export {
  CALVING_STEP,
  DLS_REPORT_STEP,
  LOT_NUMBER_STEP,
  PREGNANCY_CHECK_STEP,
  SERVICE_STEP,
  draftFrom,
  problemsAgainst,
  slotsOf,
  turnsOf,
} from "./step-shape";
export {
  monthBefore,
  monthsFromTo,
  payoutOf,
  priceAtWeight,
  splitOfProfit,
  unitsAltogether,
  unitsHeld,
  whatUnitsTake,
} from "./venture";
export type { Split, ToSplit } from "./venture";
export {
  FEWEST_KEEP_READ_DAYS,
  KEEPING,
  inTheKeepWindow,
  keepOrSell,
  keepRateOf,
  keptOver,
  perKgOfSales,
  priceOfAnimal,
  priceRangeFor,
  RECENT_SALES_DAYS,
  soldUnder,
} from "./animal-price";
export {
  CULL_REASONS,
  FEWEST_CALF_MILK_DAYS,
  fewestDaysBeforeMilkIsWeighed,
  cullReasonsOf,
  litersOver,
  milkAgainstKeep,
  milkPriceOf,
} from "./cull";
export type { CullReason, MilkAgainstKeep, MilkUnknown } from "./cull";
export {
  baselineOf,
  buyingAgainstPlan,
  lineFor,
  middleOf,
  planAverages,
  planTotals,
  plannedHeadKg,
  plannedResult,
  stillToBuyOf,
} from "./venture-plan";
export type { PlanBought, PlanLine } from "./venture-plan";
export type {
  AheadEnd,
  AnimalPrice,
  KeepCharge,
  KeepOrSell,
  KeepUnknown,
  Keeping,
  Kept,
  PriceEnd,
  PriceRange,
} from "./animal-price";
export { projectedSettlement } from "./projection";
export type { Projected, ProjectedEnd, ToProject } from "./projection";
export type {
  PayInCloseReason,
  PayInNoteState,
  PayInWay,
} from "./pay-in-notes";
export {
  PAY_IN_CLOSE_REASONS,
  PAY_IN_LINE_MOST,
  PAY_IN_NOTE_STATES,
  PAY_IN_REFERENCE_MOST,
  PAY_IN_WAYS,
  isWaitingNote,
  roomForANote,
} from "./pay-in-notes";
export type { RequestCloseReason, RequestToJoinState } from "./request-to-join";
export {
  ANSWERED_REQUEST_STATES,
  ANSWER_LINE_MOST,
  LIVE_REQUEST_STATES,
  REQUEST_CLOSE_REASONS,
  REQUEST_NOTE_MOST,
  REQUEST_TO_JOIN_STATES,
  isAnsweredRequest,
  isLiveRequest,
  isPastDecideBy,
} from "./request-to-join";
export type {
  EndedState,
  RunningState,
  VentureState,
} from "./venture-lifecycle";
export {
  ENDED_STATES,
  RUNNING_STATES,
  VENTURE_STATES,
  hasEnded,
  isRunning,
  isStillBuying,
  mayMoveTo,
  nextVentureStates,
} from "./venture-lifecycle";
export type {
  PlaybookKey,
  StandardSopChoices,
  StandardSopNeed,
} from "./standard-playbook";
export {
  ROUND_WORDS,
  URGENT_ROUND_WORDS,
  WEANING_AFTER_DAYS,
  eventOfObservation,
  PEN_NEEDS,
  STANDARD_SOP_NEEDS,
  isPenNeed,
  standardPlaybook,
} from "./standard-playbook";
export type {
  GainFirmness,
  StandardDrugKey,
  StandardFeedKey,
  StandardBreedKey,
  StandardKind,
  StandardLine,
  StandardRation,
  StandardRationKey,
} from "./standard";
export {
  STANDARD_DRUGS,
  DESHI_BREEDS,
  GAIN_FIRMNESS,
  STANDARD_BREED_KEYS,
  STANDARD_BREEDS,
  STANDARD_DRUG_FOR,
  STANDARD_FEED_ITEMS,
  STANDARD_KINDS,
  STANDARD_NOTIFIABLE_DISEASES,
  STANDARD_GAIN_FIRMNESS,
  STANDARD_RATIONS,
  rationLineOf,
} from "./standard";
export type { ReferenceGroup, StandardReference } from "./standard-references";
export {
  REFERENCES_CHECKED_ON,
  REFERENCE_GROUPS,
  STANDARD_REFERENCES,
} from "./standard-references";
export type { FeedPack, FeedUnit, PackRefusal } from "./feed-units";
export {
  FEED_PACKS,
  FEED_PACK_WORDS,
  FEED_UNITS,
  FEED_UNIT_EACH,
  FEED_UNIT_WORDS,
  MAUND_KG,
  feedUnitEach,
  feedUnitOf,
  feedUnitWord,
  mayGoByWeight,
  quantityOfPacks,
} from "./feed-units";
export type {
  Clause,
  FactLine,
  FieldValues,
  PaperCondition,
  PaperDocument,
  PaperFor,
  PaperInvestor,
  PaperParties,
  PrintedOnly,
  ReadPart,
  PaperSection,
  TemplateContent,
  TemplateField,
  TemplateKind,
  TemplateProblem,
  TemplateSection,
  TemplateSectionKind,
} from "./paper-template";
export {
  FARM_FIELDS,
  FIELDS_OF,
  MOST_WITNESSES,
  PAPER_CONDITIONS,
  RECEIVER_FIELDS,
  TEMPLATE_FIELDS,
  TEMPLATE_KINDS,
  conditionsOf,
  factsMissing,
  fieldsIn,
  isTemplateField,
  letterheadOf,
  namedFields,
  othersNamedOnly,
  paperFrom,
  partsAllowed,
  readingOf,
  templateProblems,
  termsOf,
  termsSaid,
  investorRows,
  carriesSigningClause,
  wordingAsSavedToday,
  wordingFor,
} from "./paper-template";
export {
  FIRST_PRINTED_AGREEMENT,
  NOMINATION_BEFORE_NOMINEE_NUMBERS,
  PORTAL_CONSENT_BEFORE_ORGANIZATIONS,
  PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE,
  PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
  STANDARD_AGREEMENT_BEFORE_MONTHLY,
  STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS,
  STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS,
  SCHEDULE_BEFORE_ENGLISH_FACTS,
  AMENDMENT_BEFORE_ENGLISH_FACTS,
  STANDARD_AGREEMENT_PAID_BY_THE_MONTH,
  STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
  STANDARD_TEMPLATES,
} from "./standard-templates";
export {
  INVESTOR_LOGIN_DOMAIN,
  PORTAL_SIGN_IN_HOURS,
  investorLoginOf,
  isInvestorLogin,
  phoneOfInvestorLogin,
} from "./investor-login";
export type { MobileNumber } from "./phone";
export {
  mobileNumberOf,
  phoneExample,
  phoneSaid,
  readsMobileNumbersOf,
} from "./phone";
export { maskedDigits } from "./masked-digits";
export { payInCode, payInCodeIn } from "./pay-in-code";
export {
  COMING_OF_AGE,
  MOST_NOMINEES,
  NOMINEE_HEADINGS,
  dayIn,
  dayInBangla,
  daySaid,
  isMinorOn,
  namesAMinor,
  knownBy,
  nomineeRowOf,
  nomineesProblem,
  RELATION_WORDS,
  receiverLine,
  relationOf,
  relationSaid,
  shareInBangla,
} from "./nominees";
export type {
  Nominee,
  NomineeRow,
  NomineesProblem,
  PaperNominee,
  Receiver,
  Relation,
} from "./nominees";
export type { CalfCause, CalfLosses, CalfRecord } from "./calf-losses";
export {
  CALF_DEATH_CAUSES,
  calfLosses,
  lostBeforeWeaning,
} from "./calf-losses";
export {
  CAPITAL_PAID,
  SUM_DUE_DAY,
  SUM_MISSED_AFTER_DAYS,
  TAKES_MONTHLY_SUMS,
  capitalItMayHold,
  cattleMoneyOf,
  monthlySumsOf,
  monthlyTermsOf,
  sumsStandingOf,
  takesCapital,
  towardsTheFloor,
} from "./monthly-sums";
export type {
  CapitalPaid,
  MonthlySum,
  MonthlyTerms,
  NoMonthlyTerms,
  SumsStanding,
} from "./monthly-sums";
export type { BetweenPursesRefusal } from "./between-purses";
export { whyNotBetweenPurses } from "./between-purses";
export { heldFromThem } from "./held-by";
export type { Stocking } from "./stocking";
export { stockingOf } from "./stocking";
export type { CowDryOffs, HerdDryOffs, LactationSpan } from "./dry-offs";
export { DRY_OFF_TARGETS, herdDryOffs, lactationsOf } from "./dry-offs";
export type { HeiferGrowth, HeiferWeights } from "./heifer-growth";
export { HEIFER_SERVICE, heiferGrowthOf } from "./heifer-growth";
export {
  SHED_PHONE_ONLY_DOMAIN,
  shedPhoneOnlyAddressOf,
  worksOnlyOnShedPhones,
} from "./shed-phone-only";
export { farmsOwnPayout } from "./farm-capital";
export { OWNERS_TRAIL, WHOSE_TRAIL } from "./whose-trail";
export type { AuditEntity } from "./whose-trail";
export { nameAsCompared, sameName } from "./names";
export {
  PAY_IN_ANCHOR,
  REQUESTS_ANCHOR,
  addressOf,
  whereANoticeLeads,
} from "./notice-place";
export type { NoticeAsKept, NoticePath, NoticePlace } from "./notice-place";
export {
  ALL_FARM_PARAMETERS,
  FARM_PARAMETERS,
  TIME_PARAMETERS,
  parametersOwnersAlone,
  parametersOwnersAloneRead,
} from "./farm-parameters";
export type {
  FarmParameter,
  OwnersAlone,
  OwnersAloneToRead,
  ParameterBounds,
} from "./farm-parameters";
export type { JoiningLetterFacts } from "./joining-letter";
export { countSaid, joiningLetterPaper, moneySaid } from "./joining-letter";
export type {
  MonthFigures,
  MonthlyReportFacts,
  MonthlyReportRow,
} from "./monthly-report-paper";
export { monthlyReportPaper, monthlyReportRows } from "./monthly-report-paper";
export { paperText } from "./paper-text";
export type {
  ChargeLine,
  ProgressAnimal,
  ProgressStatementFacts,
  SettlementStatementFacts,
  StatementAdjustment,
} from "./investor-statements";
export {
  daysSaid,
  kgSaid,
  progressStatementPaper,
  settlementStatementPaper,
} from "./investor-statements";
export type { AccountantSummaryFacts } from "./accountant-summary-paper";
export { accountantSummaryPaper } from "./accountant-summary-paper";
export type { DispatchOnPaper, MilkDispatchFacts } from "./milk-dispatch-paper";
export { milkDispatchPaper } from "./milk-dispatch-paper";
export type {
  HerdLine,
  HerdSummaryFacts,
  RegisterFacts,
  RegistrationFacts,
} from "./inspector-papers";
export {
  herdSummaryPaper,
  registerDocument,
  registrationPaper,
} from "./inspector-papers";
export type {
  DoseOnPaper,
  PassportFacts,
  WithdrawalStanding,
  WithdrawalSummaryFacts,
} from "./animal-papers";
export { animalPassportPaper, withdrawalSummaryPaper } from "./animal-papers";
export type { SaleReceiptFacts, TransportCardFacts } from "./sale-papers";
export { saleReceiptPaper, transportCardPaper } from "./sale-papers";
export type { SideResult, SideResults } from "./side-results";
export { sideResultsOf } from "./side-results";
export type { ReceivableAge, ReceivablesByAge } from "./receivable-ages";
export { RECEIVABLE_AGES, receivablesByAge } from "./receivable-ages";
export type { StoreValue } from "./store-value";
export { storeValueOf } from "./store-value";
export type { CashFlow, CashPosition } from "./cash-position";
export { cashFlowOf, cashPositionOf } from "./cash-position";
