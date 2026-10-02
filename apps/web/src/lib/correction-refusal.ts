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
  cannot_return_to_quarantine: "standsAside.cannotReturnToQuarantine",
  cannot_unwean: "standsAside.cannotUnwean",
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
  ask_the_vet_for_days: "refusal.askTheVetForDays",
  abortion_of_a_cow_not_carrying: "refusal.abortionOfACowNotCarrying",
  amount_changed: "refusal.amountChanged",
  bought_in_the_future: "refusal.boughtInTheFuture",
  calved_in_the_future: "refusal.calvedInTheFuture",
  calving_is_derived: "refusal.calvingIsDerived",
  calving_of_a_cow_not_in_calf: "refusal.calvingOfACowNotInCalf",
  calving_of_a_male: "refusal.calvingOfAMale",
  changed_since: "refusal.changedSince",
  breed_exists: "refusal.breedExists",
  breed_retired: "refusal.breedRetired",
  breed_unknown: "refusal.breedUnknown",
  category_exists: "refusal.categoryExists",
  category_kept_by_records: "refusal.categoryKeptByRecords",
  category_kept_for_wages: "refusal.categoryKeptForWages",
  category_retired: "refusal.categoryRetired",
  check_without_a_service: "refusal.checkWithoutAService",
  correct_the_record: "refusal.correctTheRecord",
  count_incomplete: "refusal.countIncomplete",
  medicine_count_incomplete: "refusal.medicineCountIncomplete",
  difference_needs_reason: "refusal.differenceNeedsReason",
  dispatched_in_the_future: "refusal.dispatchedInTheFuture",
  disposal_already_recorded: "refusal.disposalAlreadyRecorded",
  drug_exists: "refusal.drugExists",
  drug_exists_retired: "refusal.drugExistsRetired",
  drug_retired: "refusal.drugRetired",
  disease_exists: "refusal.diseaseExists",
  disease_exists_retired: "refusal.diseaseExistsRetired",
  dry_off_of_a_cow_not_in_milk: "refusal.dryOffOfACowNotInMilk",
  entered_in_the_future: "refusal.enteredInTheFuture",
  diagnosis_not_hers: "refusal.diagnosisNotHers",
  given_in_the_future: "refusal.givenInTheFuture",
  looks_entered_already: "refusal.looksEnteredAlready",
  product_retired: "refusal.productRetired",
  expected_calving_needed: "refusal.expectedCalvingNeeded",
  expected_calving_passed: "refusal.expectedCalvingPassed",
  expected_calving_too_far: "refusal.expectedCalvingTooFar",
  expected_calving_without_pregnancy: "refusal.expectedCalvingWithoutPregnancy",
  farm_identity_incomplete: "refusal.farmIdentityIncomplete",
  feed_item_exists: "refusal.feedItemExists",
  feed_retired: "refusal.feedRetired",
  bag_size_unknown: "refusal.bagSizeUnknown",
  bundles_by_the_head: "refusal.bundlesByTheHead",
  pack_needs_kg: "refusal.packNeedsKg",
  not_an_eid: "refusal.notAnEid",
  eid_not_announced: "refusal.eidNotAnnounced",
  no_eid_ahead: "refusal.noEidAhead",
  never_the_animals: "refusal.neverTheAnimals",
  never_monthly: "refusal.neverMonthly",
  wages_watched_by_person: "refusal.wagesWatchedByPerson",
  venture_wrong_state: "refusal.ventureWrongState",
  venture_past_decide_by: "refusal.venturePastDecideBy",
  venture_not_shown: "refusal.ventureNotShown",
  units_beyond_asked: "refusal.unitsBeyondAsked",
  units_beyond_promisable: "refusal.unitsBeyondPromisable",
  request_already_answered: "refusal.requestAlreadyAnswered",
  request_not_live: "refusal.requestNotLive",
  request_not_theirs: "refusal.requestNotTheirs",
  no_such_request: "refusal.noSuchRequest",
  already_signed_on_venture: "refusal.investorAlreadySigned",
  venture_under_floor: "refusal.ventureUnderFloor",
  venture_floor_over_target: "refusal.ventureFloorOverTarget",
  venture_floor_over_units: "refusal.ventureFloorOverUnits",
  venture_budget_over_capital: "refusal.ventureBudgetOverCapital",
  venture_no_month_to_pay_in: "refusal.ventureNoMonthToPayIn",
  venture_nothing_to_pay_monthly: "refusal.ventureNothingToPayMonthly",
  venture_units_gone: "refusal.ventureUnitsGone",
  investor_cap_reached: "refusal.investorCapReached",
  investor_exists: "refusal.investorExists",
  investor_already_signed: "refusal.investorAlreadySigned",
  expired_when_bought: "refusal.expiredWhenBought",
  no_farm_loss_to_cover: "refusal.noFarmLossToCover",
  investor_retired: "refusal.investorRetired",
  signed_in_future: "refusal.signedInFuture",
  signed_before_in_force: "refusal.signedBeforeInForce",
  nominees_too_many: "nominees.problem.too_many",
  nominees_name_missing: "nominees.problem.name_missing",
  nominees_born_missing: "nominees.problem.born_missing",
  nominees_born_in_future: "nominees.problem.born_in_future",
  nominees_shares_not_whole: "nominees.problem.shares_not_whole",
  nominees_shares_not_hundred: "nominees.problem.shares_not_hundred",
  nominees_receiver_missing: "nominees.problem.receiver_missing",
  nominees_receiver_not_needed: "nominees.problem.receiver_not_needed",
  investor_still_in: "refusal.investorStillIn",
  ration_in_use: "refusal.rationInUse",
  ration_retired: "refusal.rationRetired",
  capital_must_be_by_bank: "refusal.capitalMustBeByBank",
  agreement_has_no_paper: "refusal.agreementHasNoPaper",
  capital_not_sent_back: "refusal.capitalNotSentBack",
  capital_over_units: "refusal.capitalOverUnits",
  capital_over_cattle_part: "refusal.capitalOverCattlePart",
  cattle_money_short: "refusal.cattleMoneyShort",
  refund_not_its_money: "refusal.refundNotItsMoney",
  wage_is_the_farms: "refusal.wageIsTheFarms",
  venture_paid_in_full: "refusal.venturePaidInFull",
  paid_more_than_price: "refusal.paidMoreThanPrice",
  baki_needs_a_promise: "refusal.bakiNeedsAPromise",
  promise_before_it_left: "refusal.promiseBeforeItLeft",
  paid_more_than_owed: "refusal.paidMoreThanOwed",
  no_such_buyer: "refusal.noSuchBuyer",
  a_bull_calf_is_no_heifer: "refusal.aBullCalfIsNoHeifer",
  not_missing: "refusal.notMissing",
  gd_number_needed: "refusal.gdNumberNeeded",
  weighed_needs_a_kilo_slip: "refusal.weighedNeedsAKiloSlip",
  bank_needs_a_slip: "refusal.bankNeedsASlip",
  holds_no_cash: "refusal.holdsNoCash",
  handover_goes_nowhere: "refusal.handoverGoesNowhere",
  no_float_on_the_trip: "refusal.noFloatOnTheTrip",
  wage_took_draws: "refusal.wageTookDraws",
  draw_already_taken: "refusal.drawAlreadyTaken",
  outcome_said: "refusal.outcomeSaid",
  written_off_more_than_owed: "refusal.writtenOffMoreThanOwed",
  nothing_owed_on_it: "refusal.nothingOwedOnIt",
  venture_owns_her: "refusal.ventureOwnsHer",
  not_a_ventures_animal: "refusal.notAVenturesAnimal",
  cattle_budget_short: "refusal.cattleBudgetShort",
  float_already_drawn: "refusal.floatAlreadyDrawn",
  trip_is_another_ventures: "refusal.tripIsAnotherVentures",
  trip_is_the_farms: "refusal.tripIsTheFarms",
  venture_buys_by_bank: "refusal.ventureBuysByBank",
  not_held_here: "refusal.notHeldHere",
  names_no_farm_account: "refusal.namesNoFarmAccount",
  farm_account_not_that_kind: "refusal.farmAccountNotThatKind",
  farm_account_retired: "refusal.farmAccountRetired",
  needs_its_reference: "refusal.needsItsReference",
  reference_used_already: "refusal.referenceUsedAlready",
  farm_account_listed_already: "refusal.farmAccountListedAlready",
  before_the_first_reading: "refusal.beforeTheFirstReading",
  already_deposited: "refusal.alreadyDeposited",
  venture_sale_not_by_bkash: "refusal.ventureSaleNotByBkash",
  sale_cash_in_a_hand: "refusal.saleCashInAHand",
  float_already_reconciled: "refusal.floatAlreadyReconciled",
  float_over: "refusal.floatOver",
  float_short: "refusal.floatShort",
  not_whose_float_bought_her: "refusal.notWhoseFloatBoughtHer",
  window_is_the_ventures: "refusal.windowIsTheVentures",
  window_needed: "refusal.windowNeeded",
  she_is_gone: "refusal.sheIsGone",
  she_is_ready_for_sale: "refusal.sheIsReadyForSale",
  already_that_purse: "refusal.alreadyThatPurse",
  never_weighed: "refusal.neverWeighed",
  weighed_too_long_ago: "refusal.weighedTooLongAgo",
  no_quarantine_pen: "refusal.noQuarantinePen",
  not_a_quarantine_pen: "refusal.notAQuarantinePen",
  pen_holds_quarantine: "refusal.penHoldsQuarantine",
  stays_in_quarantine: "refusal.staysInQuarantine",
  wind_up_not_over: "refusal.windUpNotOver",
  bank_rate_from_the_future: "refusal.bankRateFromTheFuture",
  crossing_unweighed: "refusal.crossingUnweighed",
  joining_needs_a_window: "refusal.joiningNeedsAWindow",
  season_not_finished: "refusal.seasonNotFinished",
  no_such_season: "refusal.noSuchSeason",
  bred_here_needs_no_price: "refusal.bredHereNeedsNoPrice",
  head_price_backwards: "refusal.headPriceBackwards",
  nothing_left_to_buy: "refusal.nothingLeftToBuy",
  an_animal_still_stands: "refusal.anAnimalStillStands",
  a_price_is_missing: "refusal.aPriceIsMissing",
  a_float_is_open: "refusal.aFloatIsOpen",
  a_reimbursement_is_owed: "refusal.aReimbursementIsOwed",
  the_account_does_not_add_up: "refusal.theAccountDoesNotAddUp",
  the_bank_disagrees: "refusal.theBankDisagrees",
  agreements_disagree: "refusal.agreementsDisagree",
  already_approved: "refusal.alreadyApproved",
  not_yet_approved: "refusal.notYetApproved",
  already_paid: "refusal.alreadyPaid",
  not_what_he_is_owed: "refusal.notWhatHeIsOwed",
  not_yet_paid: "refusal.notYetPaid",
  no_advance_to_repay: "refusal.noAdvanceToRepay",
  no_farm_share_to_take: "refusal.noFarmShareToTake",
  advance_comes_first: "refusal.advanceComesFirst",
  already_acknowledged: "refusal.alreadyAcknowledged",
  nothing_to_pay_him: "refusal.nothingToPayHim",
  adjustment_is_closed: "refusal.adjustmentIsClosed",
  nothing_has_changed: "refusal.nothingHasChanged",
  nothing_to_pay_on_it: "refusal.nothingToPayOnIt",
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
  milk_weighed_too_soon: "refusal.milkWeighedTooSoon",
  keep_needed_longer_than_read: "refusal.keepNeededLongerThanRead",
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

/** The figures a refusal carries beside its word — how soon, how many — for words that have a place for them. */
export const figuresOf = (data: Record<string, unknown>): MessageParams => {
  const figures: MessageParams = {};
  for (const [key, value] of Object.entries(data)) {
    const aFigure = typeof value === "number" || typeof value === "string";
    if (key !== "refusal" && aFigure) {
      figures[key] = value;
    }
  }
  return figures;
};

/** A worded refusal in the reader's language, with any figure it carries, or nothing when the error was about
 *  something else. */
export const wordedRefusal = (
  error: unknown,
  t: (key: MessageKey, params?: MessageParams) => string
): string | null => {
  const data = (error as { data?: Record<string, unknown> })?.data;
  const word = data?.refusal;
  return typeof word === "string" && word in WORDED_REFUSALS
    ? t(
        WORDED_REFUSALS[word as keyof typeof WORDED_REFUSALS],
        figuresOf(data ?? {})
      )
    : null;
};

/**
 * A worded refusal that arrived as data rather than as an error — a Settlement's blocks, which are shown
 * beside the figures rather than thrown, because an Owner told only "no" has nothing to go and put right.
 *
 * The same one word list, so a word cannot exist on the server and be unsayable on the screen.
 */
export const wordFor = (
  word: string,
  t: (key: MessageKey, params?: MessageParams) => string,
  params?: MessageParams
): string | null =>
  word in WORDED_REFUSALS
    ? t(WORDED_REFUSALS[word as keyof typeof WORDED_REFUSALS], params)
    : null;

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
