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
 * The refusal words said by a sentence other than their own. Every other word is said by `refusal.` and the word in
 * camelCase — `wage_needs_month` by `refusal.wageNeedsMonth` — so a word the server starts to throw needs only its
 * sentences in the catalogs, never a line here. Said in the reader's own language, because the person reading it is
 * standing at the animal and the server's English is not for them.
 */
const SAID_OTHERWISE = {
  ...STANDING_ASIDE_WORDS,
  already_signed_on_venture: "refusal.investorAlreadySigned",
  registration_expires_before_issued: "refusal.registrationBackwards",
  // A product retired from the Drug List since the list was read: why it may not be prescribed.
  retired: "refusal.productRetired",
  wrong_pin: "device.wrongPin",
  nominees_too_many: "nominees.problem.too_many",
  nominees_name_missing: "nominees.problem.name_missing",
  nominees_born_missing: "nominees.problem.born_missing",
  nominees_born_in_future: "nominees.problem.born_in_future",
  nominees_shares_not_whole: "nominees.problem.shares_not_whole",
  nominees_shares_not_hundred: "nominees.problem.shares_not_hundred",
  nominees_receiver_missing: "nominees.problem.receiver_missing",
  nominees_receiver_not_needed: "nominees.problem.receiver_not_needed",
  nominees_nid_missing: "nominees.problem.nid_missing",
  nominees_birth_registration_missing:
    "nominees.problem.birth_registration_missing",
  nominees_receiver_nid_missing: "nominees.problem.receiver_nid_missing",
} as const satisfies Record<string, MessageKey>;

const UNDERSCORE_THEN = /_(?<next>[a-z0-9])/gu;

/** The sentence a refusal word is said by: its own, named after it, or the one it borrows. */
export const refusalKeyOf = (word: string): MessageKey =>
  (Object.hasOwn(SAID_OTHERWISE, word)
    ? SAID_OTHERWISE[word as keyof typeof SAID_OTHERWISE]
    : `refusal.${word.replaceAll(UNDERSCORE_THEN, (_, next: string) => next.toUpperCase())}`) as MessageKey;

/** A refusal word in the reader's language, with the figures it carries; nothing for a word no sentence says, which
 *  `translate` answers with the key itself. */
const said = (
  word: string,
  t: (key: MessageKey, params?: MessageParams) => string,
  params?: MessageParams
): string | null => {
  const key = refusalKeyOf(word);
  const words = t(key, params);
  return words === key ? null : words;
};

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
  return typeof word === "string" ? said(word, t, figuresOf(data ?? {})) : null;
};

/**
 * A worded refusal that arrived as data rather than as an error — a Settlement's blocks, which are shown
 * beside the figures rather than thrown, because an Owner told only "no" has nothing to go and put right.
 *
 * The same sentences, so a word cannot be said one way when thrown and another when shown.
 */
export const wordFor = (
  word: string,
  t: (key: MessageKey, params?: MessageParams) => string,
  params?: MessageParams
): string | null => said(word, t, params);

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
  return (word ? said(word, t) : null) ?? t(ENTRY_REFUSALS[category]);
};
