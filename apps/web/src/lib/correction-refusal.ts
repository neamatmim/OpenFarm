import type { StandingAsideBecause } from "@OpenFarm/api/effects/effect";
import type { EntryRefusal } from "@OpenFarm/api/entries/entry";
import type { MessageKey, MessageParams } from "@OpenFarm/i18n";

/** What the server says when a Correction is not theirs to make: which Role's window it was, how long that window is,
 *  and whether it covers other people's entries — or no Role at all, when none they hold may correct it. */
interface Refusal {
  role: string | null;
  ownEntriesOnly: boolean;
  hours?: number;
  days?: number;
}

const isRefusal = (value: unknown): value is Refusal =>
  typeof value === "object" &&
  value !== null &&
  "role" in value &&
  "ownEntriesOnly" in value;

/** The refusal as a sentence in the reader's own language, or nothing when the error was
 *  about something else. */
export const refusalMessage = (
  error: unknown,
  t: (key: MessageKey, params?: MessageParams) => string
): string | null => {
  const data = (error as { data?: { refusal?: unknown } })?.data?.refusal;
  if (!isRefusal(data)) {
    return null;
  }
  if (data.role === null) {
    return t("correct.notTheirs");
  }
  const span =
    data.days === undefined
      ? t("correct.spanHours", { hours: data.hours ?? 0 })
      : t("correct.spanDays", { days: data.days });
  const role = t(`role.${data.role}` as MessageKey);
  return t(data.ownEntriesOnly ? "correct.windowOwn" : "correct.windowAny", {
    role,
    span,
  });
};

/** Why an Effect stood aside, in the reader's language: on a late Entry the phone held, and on the Needs Review a
 *  Correction so raised. */
export const STANDING_ASIDE_WORDS = {
  moved_since: "standsAside.movedSince",
  cannot_return_to_milk: "standsAside.cannotReturnToMilk",
  calving_acted_on: "standsAside.calvingActedOn",
  service_checked: "standsAside.serviceChecked",
  no_ration: "standsAside.noRation",
  renewal_superseded: "standsAside.renewalSuperseded",
} as const satisfies Record<StandingAsideBecause, MessageKey>;

/**
 * Refusals that are a single word rather than a Correction Window: the reason a Step's record
 * would not be taken. Said in the reader's own language, because the person reading it is standing
 * at the animal and the server's English is not for them.
 */
const WORDED_REFUSALS = {
  ...STANDING_ASIDE_WORDS,
  aborted_before_she_was_served: "refusal.abortedBeforeSheWasServed",
  aborted_in_the_future: "refusal.abortedInTheFuture",
  abortion_of_a_cow_not_carrying: "refusal.abortionOfACowNotCarrying",
  amount_changed: "refusal.amountChanged",
  bought_in_the_future: "refusal.boughtInTheFuture",
  calved_in_the_future: "refusal.calvedInTheFuture",
  calving_is_derived: "refusal.calvingIsDerived",
  calving_of_a_cow_not_in_calf: "refusal.calvingOfACowNotInCalf",
  calving_of_a_male: "refusal.calvingOfAMale",
  changed_since: "refusal.changedSince",
  category_exists: "refusal.categoryExists",
  category_kept_by_records: "refusal.categoryKeptByRecords",
  category_kept_for_wages: "refusal.categoryKeptForWages",
  category_retired: "refusal.categoryRetired",
  check_without_a_service: "refusal.checkWithoutAService",
  correct_the_record: "refusal.correctTheRecord",
  count_incomplete: "refusal.countIncomplete",
  difference_needs_reason: "refusal.differenceNeedsReason",
  dispatched_in_the_future: "refusal.dispatchedInTheFuture",
  disposal_already_recorded: "refusal.disposalAlreadyRecorded",
  drug_retired: "refusal.drugRetired",
  dry_off_of_a_cow_not_in_milk: "refusal.dryOffOfACowNotInMilk",
  entered_in_the_future: "refusal.enteredInTheFuture",
  expected_calving_needed: "refusal.expectedCalvingNeeded",
  expected_calving_passed: "refusal.expectedCalvingPassed",
  expected_calving_too_far: "refusal.expectedCalvingTooFar",
  expected_calving_without_pregnancy: "refusal.expectedCalvingWithoutPregnancy",
  farm_identity_incomplete: "refusal.farmIdentityIncomplete",
  feed_retired: "refusal.feedRetired",
  never_the_animals: "refusal.neverTheAnimals",
  venture_wrong_state: "refusal.ventureWrongState",
  venture_under_floor: "refusal.ventureUnderFloor",
  venture_floor_over_target: "refusal.ventureFloorOverTarget",
  venture_budget_over_capital: "refusal.ventureBudgetOverCapital",
  venture_units_gone: "refusal.ventureUnitsGone",
  investor_cap_reached: "refusal.investorCapReached",
  investor_exists: "refusal.investorExists",
  capital_must_be_by_bank: "refusal.capitalMustBeByBank",
  agreement_has_no_paper: "refusal.agreementHasNoPaper",
  capital_not_sent_back: "refusal.capitalNotSentBack",
  capital_over_units: "refusal.capitalOverUnits",
  refund_not_its_money: "refusal.refundNotItsMoney",
  wage_is_the_farms: "refusal.wageIsTheFarms",
  venture_owns_her: "refusal.ventureOwnsHer",
  not_a_ventures_animal: "refusal.notAVenturesAnimal",
  cattle_budget_short: "refusal.cattleBudgetShort",
  float_already_drawn: "refusal.floatAlreadyDrawn",
  trip_is_another_ventures: "refusal.tripIsAnotherVentures",
  float_already_reconciled: "refusal.floatAlreadyReconciled",
  float_over: "refusal.floatOver",
  float_short: "refusal.floatShort",
  not_whose_float_bought_her: "refusal.notWhoseFloatBoughtHer",
  she_is_ready_for_sale: "refusal.sheIsReadyForSale",
  already_that_purse: "refusal.alreadyThatPurse",
  never_weighed: "refusal.neverWeighed",
  weighed_again_since: "refusal.weighedAgainSince",
  not_a_fattening_animal: "refusal.notAFatteningAnimal",
  buyer_cannot_trade: "refusal.buyerCannotTrade",
  nothing_to_reimburse: "refusal.nothingToReimburse",
  month_already_reimbursed: "refusal.monthAlreadyReimbursed",
  month_not_over: "refusal.monthNotOver",
  month_before_the_venture: "refusal.monthBeforeTheVenture",
  say_what_you_found_out: "refusal.sayWhatYouFoundOut",
  venture_is_settled: "refusal.ventureIsSettled",
  reimbursement_is_computed: "refusal.reimbursementIsComputed",
  venture_is_cancelled: "refusal.ventureIsCancelled",
  one_side_of_a_sale: "refusal.oneSideOfASale",
  seller_cannot_trade: "refusal.sellerCannotTrade",
  cash_back_needs_a_slip: "refusal.cashBackNeedsASlip",
  harvest_has_no_price: "refusal.harvestHasNoPrice",
  lot_number_missing: "refusal.lotNumberMissing",
  manager_only: "refusal.managerOnly",
  month_is_for_wages: "refusal.monthIsForWages",
  no_calving_expected: "refusal.noCalvingExpected",
  no_such_bull: "refusal.noSuchBull",
  not_a_repeat_breeder: "refusal.notARepeatBreeder",
  not_awaiting_approval: "refusal.notAwaitingApproval",
  nothing_to_correct: "refusal.nothingToCorrect",
  owner_only: "refusal.ownerOnly",
  period_backwards: "refusal.periodBackwards",
  period_too_long: "refusal.periodTooLong",
  purchase_needs_price_and_seller: "refusal.purchaseNeedsPriceAndSeller",
  received_in_the_future: "refusal.receivedInTheFuture",
  register_has_no_csv: "refusal.registerHasNoCsv",
  register_has_no_paper: "refusal.registerHasNoPaper",
  renewal_needs_certificate: "refusal.renewalNeedsCertificate",
  renewal_needs_expiry: "refusal.renewalNeedsExpiry",
  renewal_not_later: "refusal.renewalNotLater",
  service_needs_technician: "refusal.serviceNeedsTechnician",
  service_of_a_male: "refusal.serviceOfAMale",
  staff_or_manager_only: "refusal.staffOrManagerOnly",
  vet_only: "refusal.vetOnly",
  visited_in_the_future: "refusal.visitedInTheFuture",
  wage_already_entered: "refusal.wageAlreadyEntered",
  wage_needs_month: "refusal.wageNeedsMonth",
  work_in_no_pen: "refusal.workInNoPen",
} as const satisfies Record<string, MessageKey>;

/** A worded refusal in the reader's language, or nothing when the error was about something else. */
export const wordedRefusal = (
  error: unknown,
  t: (key: MessageKey, params?: MessageParams) => string
): string | null => {
  const word = (error as { data?: { refusal?: unknown } })?.data?.refusal;
  return typeof word === "string" && word in WORDED_REFUSALS
    ? t(WORDED_REFUSALS[word as keyof typeof WORDED_REFUSALS])
    : null;
};

/** Why a Correction was not taken, in the reader's language — its window, its Role, a value changed since, nothing
 *  changed, or the kind's own word — or nothing, when the error was about something else. */
export const correctionRefusalMessage = (
  error: unknown,
  t: (key: MessageKey, params?: MessageParams) => string
): string | null => refusalMessage(error, t) ?? wordedRefusal(error, t);

/** Whether the record was corrected by someone else since the screen showed it: what the screen holds is stale. */
export const isChangedSince = (error: unknown): boolean =>
  (error as { data?: { refusal?: unknown } })?.data?.refusal ===
  "changed_since";

/** What each way of not taking an Entry says, when the Entry gave no word of its own. */
const ENTRY_REFUSALS = {
  late: "outbox.late",
  wrong: "outbox.wrong",
  not_yours: "outbox.notYours",
} as const satisfies Record<EntryRefusal["category"], MessageKey>;

/** Why the farm did not simply take an Entry a phone held, in the reader's language: the Entry's own word where it gave
 *  one, or what its kind of refusal means. Nothing for a batch refused whole, which has only the server's message. */
export const entryRefusalMessage = (
  refusal: EntryRefusal | undefined,
  t: (key: MessageKey, params?: MessageParams) => string
): string | null => {
  if (!refusal) {
    return null;
  }
  const { word, category } = refusal;
  return word && word in WORDED_REFUSALS
    ? t(WORDED_REFUSALS[word as keyof typeof WORDED_REFUSALS])
    : t(ENTRY_REFUSALS[category]);
};
