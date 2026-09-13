import type { MessageKey, MessageParams } from "@OpenFarm/i18n";

/** What the server says when a Correction Window has closed: which Role's window it was,
 *  how long that window is, and whether it covers other people's entries. */
interface Refusal {
  role: string;
  ownEntriesOnly: boolean;
  hours?: number;
  days?: number;
}

const isRefusal = (value: unknown): value is Refusal =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Refusal).role === "string";

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

/**
 * Refusals that are a single word rather than a Correction Window: the reason a Step's record
 * would not be taken. Said in the reader's own language, because the person reading it is standing
 * at the animal and the server's English is not for them.
 */
const WORDED_REFUSALS = {
  aborted_before_she_was_served: "refusal.abortedBeforeSheWasServed",
  aborted_in_the_future: "refusal.abortedInTheFuture",
  abortion_of_a_cow_not_carrying: "refusal.abortionOfACowNotCarrying",
  amount_changed: "refusal.amountChanged",
  bought_in_the_future: "refusal.boughtInTheFuture",
  calved_in_the_future: "refusal.calvedInTheFuture",
  calving_is_derived: "refusal.calvingIsDerived",
  calving_of_a_cow_not_in_calf: "refusal.calvingOfACowNotInCalf",
  category_exists: "refusal.categoryExists",
  category_kept_by_records: "refusal.categoryKeptByRecords",
  category_retired: "refusal.categoryRetired",
  check_without_a_service: "refusal.checkWithoutAService",
  correct_the_record: "refusal.correctTheRecord",
  count_incomplete: "refusal.countIncomplete",
  difference_needs_reason: "refusal.differenceNeedsReason",
  dispatched_in_the_future: "refusal.dispatchedInTheFuture",
  drug_retired: "refusal.drugRetired",
  dry_off_of_a_cow_not_in_milk: "refusal.dryOffOfACowNotInMilk",
  entered_in_the_future: "refusal.enteredInTheFuture",
  expected_calving_needed: "refusal.expectedCalvingNeeded",
  expected_calving_passed: "refusal.expectedCalvingPassed",
  expected_calving_too_far: "refusal.expectedCalvingTooFar",
  expected_calving_without_pregnancy: "refusal.expectedCalvingWithoutPregnancy",
  farm_identity_incomplete: "refusal.farmIdentityIncomplete",
  feed_retired: "refusal.feedRetired",
  harvest_has_no_price: "refusal.harvestHasNoPrice",
  manager_only: "refusal.managerOnly",
  month_is_for_wages: "refusal.monthIsForWages",
  no_calving_expected: "refusal.noCalvingExpected",
  no_such_bull: "refusal.noSuchBull",
  not_a_repeat_breeder: "refusal.notARepeatBreeder",
  not_awaiting_approval: "refusal.notAwaitingApproval",
  owner_only: "refusal.ownerOnly",
  period_backwards: "refusal.periodBackwards",
  period_too_long: "refusal.periodTooLong",
  purchase_needs_price_and_seller: "refusal.purchaseNeedsPriceAndSeller",
  received_in_the_future: "refusal.receivedInTheFuture",
  service_already_checked: "refusal.serviceAlreadyChecked",
  service_needs_technician: "refusal.serviceNeedsTechnician",
  service_of_a_male: "refusal.serviceOfAMale",
  staff_or_manager_only: "refusal.staffOrManagerOnly",
  vet_only: "refusal.vetOnly",
  visited_in_the_future: "refusal.visitedInTheFuture",
  wage_already_entered: "refusal.wageAlreadyEntered",
  wage_needs_month: "refusal.wageNeedsMonth",
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
