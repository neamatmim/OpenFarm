export type {
  AnimalState,
  Disposal,
  ExitState,
  MortalityKind,
  Side,
} from "./lifecycle";
export {
  DISPOSALS,
  ENTRY_STATES,
  EXIT_STATES,
  LIVE_STATES,
  MORTALITY_KINDS,
  SIDES,
  STATES,
  STATES as ANIMAL_STATES,
  allowedNextStates,
  canTransition,
  isExitState,
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
export { farmOfOriginLines, identityView } from "./farm";
export {
  FARM_UTC_OFFSET_MINUTES,
  farmDayOf,
  startOfFarmDay,
} from "./farm-clock";
export type {
  FatteningView,
  GainBasis,
  TargetWindow,
  WeighIn,
} from "./fattening";
export {
  EID_UL_ADHA,
  PLAUSIBLE_DAILY_GAIN_KG,
  PLAUSIBLE_DAILY_LOSS_KG,
  QURBANI_DAYS,
  fatteningView,
  implausibleChange,
  nextEidWindow,
} from "./fattening";
export type { ReadyReason } from "./ready";
export {
  READY_REASONS,
  readyGrounds,
  stillWorthSaying,
  windowHasClosed,
} from "./ready";
export type {
  AnimalPassport,
  DoseGiven,
  PenSpell,
  ShortenedHold,
  SaleReceipt,
  SoldAnimal,
  TransportCard,
  WithdrawalSummary,
} from "./papers";
export {
  animalPassport,
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
export type { QuietHours } from "./notify";
export {
  DELIVERY,
  carryingMoments,
  goesByText,
  goesNow,
  isQuiet,
  lastCarryingMoment,
  minutesInTheDay,
  waitsForTheDigest,
  wakesTheFarm,
} from "./notify";
export type { DueWork } from "./work";
export {
  AWAITING_SIGN_OFF,
  MAX_GRACE_MINUTES,
  OPEN_INSTANCE_STATES,
  isEscalated,
  isOpen,
  isOverdue,
  minutesOverdue,
} from "./work";
export type {
  FeedingEntryLine,
  FeedingLine,
  RationLine,
  StockMovement,
} from "./feed";
export {
  KG_DECIMALS,
  MAUND_KG,
  MAX_KG_PER_ANIMAL_PER_DAY,
  findRationProblems,
  isShortFed,
  lastFellBelow,
  maundsOf,
  perSessionKg,
  roundKg,
  shortfallPercent,
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
  CALVING_EVIDENCE,
  SERVICE_EVIDENCE,
  STEP_EFFECT_KINDS,
  TRIGGER_KINDS,
  appliesToAnimal,
  describeChanges,
  isClinicalStep,
  isClosingStep,
  raisesItsOwnWork,
  sessionsPerDayOf,
  findMissingBangla,
  findPublishBlockers,
  findStructuralProblems,
} from "./sop";
