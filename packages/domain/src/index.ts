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
  PregnancyCheckResult,
  ServiceMethod,
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
  attemptsThatFailed,
  calvingWorkDue,
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
  farmOfOriginLines,
  goodUntilOf,
  identityView,
  registrationStanding,
  renewalOpensAt,
} from "./farm";
export {
  FARM_UTC_OFFSET_MINUTES,
  farmDayOf,
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
  fatteningView,
  implausibleChange,
} from "./fattening";
export type { EidBasis, EidWindow, ListedEid } from "./eid";
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
} from "./eid";
export type { ReadyReason } from "./ready";
export {
  READY_REASONS,
  readyGrounds,
  stillWorthSaying,
  windowHasClosed,
} from "./ready";
export type {
  AnimalPassport,
  DispatchLine,
  MilkDispatchRecord,
  AccountantSummary,
  DoseGiven,
  HealthRegister,
  InspectorRegister,
  HerdSummary,
  HerdSummaryLine,
  RegisterPaper,
  RegisterPaperField,
  RegisterPaperRow,
  RegistrationRecord,
  PenSpellLine,
  CapitalLine,
  JoiningLetter,
  ProgressAnimal,
  ProgressStatement,
  SettlementStatement,
  SpendLine,
  StatementAdjustment,
  StatementSheet,
  ShortenedHold,
  SaleReceipt,
  SoldAnimal,
  StampLine,
  DocumentRow,
  Said,
  TransportCard,
  WithdrawalSummary,
} from "./papers";
export {
  INSPECTOR_REGISTERS,
  accountantSummary,
  animalPassport,
  NO_GUARANTEE_LINES,
  investorStatement,
  joiningLetter,
  progressStatement,
  settlementStatement,
  stampLines,
  registerPaper,
  herdSummary,
  registrationRecord,
  milkDispatchRecord,
  saleReceipt,
  transportCard,
  withdrawalSummary,
} from "./papers";
export type { NotifiableLetter } from "./letter";
export { notifiableLetter } from "./letter";
export type { TagPrefix } from "./tag-number";
export {
  TAG_PREFIXES,
  formatTagNumber,
  isTagNumber,
  parseTagNumber,
  prefixForOrigin,
} from "./tag-number";
export type { LactationView, MilkDestination, Reconciliation } from "./milk";
export {
  LITRE_DECIMALS,
  MILK_DESTINATIONS,
  daysInMilk,
  destinationFor,
  lactationView,
  reconcile,
  litresTo,
  roundLitres,
  underMilkWithdrawal,
} from "./milk";
export { derivePinHash, isPin, randomPinSalt, verifyPin } from "./pin";
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
  RationLine,
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
  stockLedger,
} from "./feed";
export type {
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
  mayBePrescribed,
  underMeatWithdrawal,
  whyNotPrescribable,
  WITHDRAWAL_LOOK_BACK_DAYS,
  withdrawalEndsAt,
  withdrawalView,
} from "./health";
export type { RoleName } from "./roles";
export { ROLES } from "./roles";
export type {
  AppliesTo,
  Bilingual,
  Choice,
  Evidence,
  EvidenceType,
  FarmEvent,
  SopChange,
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
  PHOTO_MAX_BYTES,
  STEP_EFFECT_KINDS,
  TRIGGER_KINDS,
  appliesToAnimal,
  isWholeFarmWork,
  scheduleFallsOn,
  describeChanges,
  isClinicalStep,
  isClosingStep,
  mayRaiseByHand,
  maySkip,
  missingEvidence,
  raisesItsOwnWork,
  sessionsPerDayOf,
  findMissingBangla,
  findPublishBlockers,
  findStructuralProblems,
} from "./sop";
export type { ApprovedTerms, MoneyApproval, PaymentMethod } from "./money";
export {
  PAYMENT_METHODS,
  approvalOf,
  roundTaka,
  termsUnchanged,
} from "./money";
export type {
  CostShare,
  Costs,
  FeedShare,
  Carried,
  FeedingToCost,
  HerdCostToSplit,
  TripToSplit,
  UnallocatedFeeding,
  UnallocatedHerdCost,
  UnallocatedTrip,
} from "./costs";
export {
  PURCHASES_A_DOSE_IS_COSTED_OVER,
  costOfGainOf,
  costPerLitreOf,
  dosePriceOf,
  feedShares,
  herdShares,
  marginOf,
  monthOf,
  roundedCosts,
  tripShares,
} from "./costs";
export { groupedBy } from "./grouped-by";
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
  MoneyToSummarise,
  SideShare,
} from "./money-summary";
export { summariseMoney } from "./money-summary";
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
} from "./venture";
export type { Split, ToSplit } from "./venture";
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
  STANDARD_SOP_NEEDS,
  standardPlaybook,
} from "./standard-playbook";
export type {
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
  STANDARD_BREED_KEYS,
  STANDARD_BREEDS,
  STANDARD_DRUG_FOR,
  STANDARD_FEED_ITEMS,
  STANDARD_KINDS,
  STANDARD_NOTIFIABLE_DISEASES,
  STANDARD_RATIONS,
  rationLineOf,
} from "./standard";
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
  FactLine,
  FieldValues,
  PaperDocument,
  PaperInvestor,
  PaperParties,
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
  TEMPLATE_FIELDS,
  TEMPLATE_KINDS,
  factsMissing,
  fieldsIn,
  isTemplateField,
  namedFields,
  paperFrom,
  partsAllowed,
  templateProblems,
  termsOf,
} from "./paper-template";
export { STANDARD_TEMPLATES } from "./standard-templates";
export {
  INVESTOR_LOGIN_DOMAIN,
  investorLoginOf,
  isInvestorLogin,
  mobileNumberOf,
} from "./investor-login";
export { maskedDigits } from "./masked-digits";
export { payInCode, payInCodeIn } from "./pay-in-code";
