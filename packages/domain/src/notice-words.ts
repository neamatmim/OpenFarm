import type { Language, MessageParams } from "@OpenFarm/i18n";
import {
  currencySign,
  formatDate,
  formatNumber,
  translate,
} from "@OpenFarm/i18n";

import type { AlertKind } from "./alerts";
import { ALERT_KINDS } from "./alerts";
import { feedUnitEach, feedUnitWord } from "./feed-units";
import type { LotFacts, NoticeFacts, WorkFacts } from "./notice-facts";

const MINUTES_PER_HOUR = 60;

/** How late something is, in whole hours, for a message that says "late by N hours". Always
 *  at least one: the notice only exists because it is late, and "late by 0 hours" reads as
 *  a bug rather than as a small delay. */
export const hoursLate = (minutes: number): number =>
  Math.max(1, Math.round(minutes / MINUTES_PER_HOUR));

/** A name the farm keeps in both languages, in the reader's — the Bangla where no English was written. */
const named = (bn: unknown, en: unknown, language: Language) =>
  String((language === "bn" ? bn : en) ?? bn ?? "");

/** The kilos a Sale's low price was worked on and whose they were, after the price; nothing for an older notice. */
const floorBasis = (
  facts: { floorKg?: number; floorFrom?: "scale" | "day" },
  language: Language
): string => {
  if (typeof facts.floorKg !== "number") {
    return "";
  }
  const kg = formatNumber(facts.floorKg, language);
  if (language === "bn") {
    return facts.floorFrom === "scale"
      ? ` — শেষ ওজন থেকে ধরা ${kg} কেজির হিসাবে`
      : ` — বিক্রির দিনের ${kg} কেজির হিসাবে`;
  }
  return facts.floorFrom === "scale"
    ? ` — on ${kg} kg from her last weighing`
    : ` — on the day's ${kg} kg`;
};

/** A day or an instant the Notice carries, said in the reader's own calendar; nothing when it carries none. */
const saidDate = (
  value: unknown,
  language: Language,
  style: "date" | "dateTime" = "date"
) =>
  typeof value === "string" ? formatDate(new Date(value), language, style) : "";

/** A piece of work: which procedure and where — the whole farm, for work that stands in no Pen. */
const theWork = (facts: Partial<WorkFacts>, language: Language) => ({
  sop: named(facts.sopBn, facts.sopEn, language),
  pen:
    typeof facts.pen === "string"
      ? facts.pen
      : translate(language, "work.wholeFarm"),
});

/** What a lot is counted in: a box of medicine in doses, feed in its own unit. */
const countedIn = (facts: LotFacts, language: Language): string => {
  if (facts.what === "medicine") {
    return translate(language, "drugs.doseWord");
  }
  return facts.unit ? feedUnitWord(facts.unit, language) : "";
};

/** The medicine or feed a notice about the store names, its Lot, and how much of it is left — a box of medicine
 *  counted in doses, a bag of feed in its own unit. */
const theLot = (facts: LotFacts, language: Language) => ({
  item: facts.name,
  lot: facts.lotNumber ?? "—",
  left: `${formatNumber(Number(facts.left), language)} ${countedIn(facts, language)}`.trim(),
  date: saidDate(facts.expiresOn, language),
});

type Filling<Kind extends AlertKind> = (
  facts: NoticeFacts[Kind],
  language: Language
) => MessageParams;

/**
 * What each kind's words are filled with, from the facts it was raised with. One entry per kind, typed on that
 * kind's facts, so a kind cannot be added without saying what its words need — the farm's list, a pocket and a
 * text message all ask here, and a placeholder nobody fills prints itself.
 */
const FILLINGS: { [Kind in AlertKind]: Filling<Kind> } = {
  instance_overdue: theWork,
  instance_escalated: (facts, language) => ({
    ...theWork(facts, language),
    hours: hoursLate(facts.minutesOverdue ?? 0),
  }),
  instance_sent_back: (facts, language) => ({
    ...theWork(facts, language),
    reason: facts.reason,
  }),
  // Whatever was being put right carried its own facts; a piece of work names itself as any other does.
  needs_review: (facts, language) =>
    theWork(facts as Partial<WorkFacts>, language),
  sop_published: (facts, language) => ({
    sop: named(facts.sopBn, facts.sopEn, language),
    number: Number(facts.number),
  }),
  sop_proposed: (facts, language) => ({
    sop: named(facts.sopBn, facts.sopEn, language),
  }),
  sop_retired: (facts, language) => ({
    sop: named(facts.sopBn, facts.sopEn, language),
  }),
  sop_restored: (facts, language) => ({
    sop: named(facts.sopBn, facts.sopEn, language),
  }),
  withdrawal_ending: (facts) => ({ tag: facts.tag }),
  withdrawal_changed: (facts) => ({ tag: facts.tag }),
  notifiable_diagnosis: (facts) => ({ tag: facts.tag, disease: facts.disease }),
  milk_unaccounted: (facts, language) => ({
    litres: Number(facts.litres),
    percent: Number(facts.percent),
    since: saidDate(facts.since, language),
  }),
  medicine_short: (facts, language) => ({
    amount: Number(facts.shortMoney),
    day: saidDate(facts.countedOn, language),
  }),
  still_here_after_eid: (facts, language) => ({
    day: saidDate(facts.day, language),
    animals: Number(facts.animals),
    inVentures: Number(facts.inVentures),
  }),
  sold_under_cost: (facts, language) => ({
    tag: facts.tag,
    price: Number(facts.priceMoney),
    cost: Number(facts.costMoney),
    low:
      typeof facts.lowMoney === "number"
        ? `${currencySign()}${formatNumber(facts.lowMoney, language)}`
        : "—",
    basis: floorBasis(facts, language),
  }),
  entered_twice: (facts, language) => ({
    name: facts.name,
    amount: Number(facts.amountMoney),
    day: saidDate(facts.day, language),
    by: facts.by,
  }),
  monthly_sum_missed: (facts, language) => ({
    investor: facts.investor,
    venture: facts.venture,
    amount: Number(facts.missedMoney),
    day: saidDate(facts.dueOn, language),
  }),
  mortality_undiagnosed: (facts, language) => ({
    tag: facts.tag,
    how: named(
      facts.kind === "culled" ? "বাদ দেওয়া হয়েছে" : "মারা গেছে",
      facts.kind === "culled" ? "was culled" : "died",
      language
    ),
    cause: facts.cause,
  }),
  mortality_recorded: (facts, language) => ({
    tag: facts.tag,
    how: named(
      facts.kind === "culled" ? "বাদ দেওয়া হয়েছে" : "মারা গেছে",
      facts.kind === "culled" ? "was culled" : "died",
      language
    ),
    cause: facts.cause,
    cost: Number(facts.costMoney),
    venture: facts.venture
      ? named(` (${facts.venture}-এর)`, ` (${facts.venture}'s)`, language)
      : "",
  }),
  large_shrink: (facts, language) => ({
    tag: facts.tag,
    last: Number(facts.lastKg),
    day: saidDate(facts.lastOn, language),
    sale: Number(facts.saleKg),
    percent: Number(facts.percent),
  }),
  arrival_weight_short: (facts, language) => ({
    tag: facts.tag,
    seller:
      facts.seller || (language === "bn" ? "অজানা বিক্রেতা" : "an unnamed seller"),
    arrival: Number(facts.arrivalKg),
    weighed: Number(facts.weighedKg),
    days: Number(facts.days),
    percent: Number(facts.percent),
  }),
  cash_short: (facts, language) => ({
    name: facts.name,
    amount: Number(facts.shortMoney),
    day: saidDate(facts.countedOn, language),
  }),
  settings_changed: (facts) => ({
    name: facts.name,
    count: Number(facts.count),
  }),
  feed_price_jump: (facts, language) => ({
    feed: facts.feed,
    unit: feedUnitEach(facts.unit, language),
    price: Number(facts.unitPriceMoney),
    previous: Number(facts.previousUnitPriceMoney),
    percent: Number(facts.percent),
  }),
  dose_not_prescribed: (facts) => ({
    tag: facts.tag,
    product: facts.product,
    advice: facts.advice,
  }),
  head_count_differs: (facts) => ({
    pen: facts.pen,
    counted: Number(facts.counted),
    expected: Number(facts.expected),
  }),
  pen_sores_seen: (facts, language) => ({
    pen: facts.pen,
    animals: Number(facts.animals),
    since: saidDate(facts.since, language),
  }),
  store_shortfall: (facts, language) => ({
    amount: Number(facts.shortMoney),
    day: saidDate(facts.countedOn, language),
  }),
  animal_missing: (facts, language) => ({
    tag: facts.tag,
    pen: facts.pen,
    since: saidDate(facts.since, language),
  }),
  receivable_overdue: (facts, language) => ({
    buyer: facts.buyer,
    amount: Number(facts.owingMoney),
    since: saidDate(facts.overdueFrom, language),
  }),
  low_stock: (facts, language) => ({
    feed: facts.nameBn,
    onHand: Number(facts.onHand),
    unit: feedUnitWord(facts.unit, language),
  }),
  money_awaiting_approval: (facts, language) => ({
    // A Notice raised before money crossed the store as a number carries its amount as text.
    amount: Number(facts.amountMoney),
    category: named(facts.categoryBn, facts.categoryEn, language),
  }),
  registration_renewal_due: (facts, language) => ({
    date: saidDate(facts.expiresOn, language),
  }),
  // The occasion arrives already worded, because the word the code keeps would print `buying_closed` into the
  // middle of a Bangla sentence.
  investor_statement_due: (facts) => ({
    venture: facts.venture,
    investors: Number(facts.investors),
    occasion: facts.occasion,
  }),
  reimbursement_due: (facts, language) => ({
    venture: facts.venture,
    month:
      typeof facts.month === "string"
        ? formatDate(
            new Date(`${facts.month}-01T06:00:00.000Z`),
            language,
            "monthYear"
          )
        : "",
    // Whole taka, as the sheet it opens says the transfer: paisa in one and not the other read as two figures.
    amount: Math.round(Number(facts.owedMoney)),
  }),
  entry_rejected: (facts) => ({
    count: Number(facts.count),
    reason: facts.reason,
  }),
  day_not_turning: (facts, language) => ({
    since: saidDate(facts.since, language, "dateTime"),
  }),
  backup_overdue: (facts, language) => ({
    since: saidDate(facts.since, language, "dateTime"),
  }),
  lot_expiring: theLot,
  lot_expired: theLot,
  medicine_low_stock: (facts) => ({
    item: facts.name,
    onHand: Number(facts.onHand),
  }),
  expired_dose_given: (facts, language) => ({
    tag: facts.tag,
    item: facts.name,
    lot: facts.lotNumber ?? "—",
    date: saidDate(facts.expiresOn, language),
  }),
  // A number, so the words say it in the reader's own numerals.
  join_requested: (facts) => ({
    investor: facts.investor,
    venture: facts.venture,
    units: Number(facts.units),
  }),
};

const isKind = (kind: string): kind is AlertKind =>
  (ALERT_KINDS as readonly string[]).includes(kind);

/**
 * What a Notice's words are filled with, in the reader's language: the one answer the farm's own list, a pocket and a
 * text message share.
 *
 * The facts come back from the farm's store as it holds them, so their shape is the promise the kind was raised
 * under rather than the type system's. A kind this build does not know says nothing, and its words are left alone.
 */
export const noticeFilling = (
  kind: string,
  facts: unknown,
  language: Language
): MessageParams => {
  if (!isKind(kind)) {
    return {};
  }
  const fill = FILLINGS[kind] as Filling<AlertKind>;
  const filled = fill((facts ?? {}) as NoticeFacts[AlertKind], language);
  // A fact an older Notice was raised without says nothing, rather than printing its own placeholder.
  return Object.fromEntries(
    Object.entries(filled).map(([name, value]) => [name, value ?? ""])
  );
};
