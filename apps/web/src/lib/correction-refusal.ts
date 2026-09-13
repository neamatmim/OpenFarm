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
  calved_in_the_future: "refusal.calvedInTheFuture",
  calving_is_derived: "refusal.calvingIsDerived",
  calving_not_yours: "refusal.calvingNotYours",
  calving_of_a_cow_not_in_calf: "refusal.calvingOfACowNotInCalf",
  check_without_a_service: "refusal.checkWithoutAService",
  dry_off_of_a_cow_not_in_milk: "refusal.dryOffOfACowNotInMilk",
  expected_calving_needed: "refusal.expectedCalvingNeeded",
  expected_calving_passed: "refusal.expectedCalvingPassed",
  expected_calving_too_far: "refusal.expectedCalvingTooFar",
  expected_calving_without_pregnancy: "refusal.expectedCalvingWithoutPregnancy",
  manager_only: "refusal.managerOnly",
  no_calving_expected: "refusal.noCalvingExpected",
  no_such_bull: "refusal.noSuchBull",
  service_needs_technician: "refusal.serviceNeedsTechnician",
  service_already_checked: "refusal.serviceAlreadyChecked",
  service_of_a_male: "refusal.serviceOfAMale",
  vet_only: "refusal.vetOnly",
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
