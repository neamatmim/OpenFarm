import type { MessageKey } from "@OpenFarm/i18n";

import type { AlertKind } from "./alerts";

/** How one kind of notice is delivered. */
interface Delivery {
  when: "immediate" | "digest";
  /** Also worth a text message, to the Owner and the Manager. */
  sms?: true;
  /** May wake the farm: quiet hours are 22:00–05:00 and safety alerts are the exception,
   *  which means these and nothing else. Everything else still reaches the app at once — the
   *  quiet is on the phone, not on the record. */
  wakesTheFarm?: true;
}

/**
 * How each kind of notice reaches a person, in one place.
 *
 * **Immediate** is the Alert proper: it goes now, into a pocket, through quiet hours,
 * because it costs money or breaks a legal deadline if it waits. **Digest** is everything
 * else — true, worth knowing, and no worse for arriving at six with the rest.
 *
 * Typed by the kind, so a new kind of notice cannot be added without somebody deciding
 * which of the two it is. That decision is the whole of the farm's notification table.
 *
 * The farm's delivery table: when each kind of notice goes, and whether it is one of the two
 * worth a text message as well.
 *
 * One table, because "what goes by SMS" is a delivery decision like any other and a second list
 * somewhere else is how a farm ends up texting people about a feed digest. Two kinds carry
 * `sms`, and they are the two that cost money or break a legal deadline if they are missed. Each row keeps what it
 * actually says, so the words table beside it can ask which kinds go by text.
 */
export const DELIVERY = {
  instance_overdue: { when: "immediate" },
  instance_escalated: { when: "immediate" },
  instance_sent_back: { when: "immediate" },
  needs_review: { when: "digest" },
  sop_published: { when: "digest" },
  sop_proposed: { when: "digest" },
  // Work leaving the list, or coming back to it, is news for the morning, not a reason to wake anybody.
  sop_retired: { when: "digest" },
  sop_restored: { when: "digest" },
  // A Withdrawal ending is one of the two the farm cannot afford to miss: a tank the milk
  // could have gone into, or a cow that could have been sold, and a day of either is money.
  withdrawal_ending: { when: "immediate", sms: true, wakesTheFarm: true },
  // The other one the farm cannot afford to miss: the Act says the report goes without delay,
  // and a notice that waits for the evening post has already made the farm late.
  notifiable_diagnosis: { when: "immediate", sms: true, wakesTheFarm: true },
  // The last row the notification table owed: an entry the farm would not take is work somebody
  // believes they have done. They are told at once, in the app, and never by text — it is their
  // own phone that is holding the entry.
  entry_rejected: { when: "immediate" },
  // A hold starting or being shortened changes where tomorrow's milk goes, so the Manager is
  // told at once — but it is not one of the two that cost money the moment they are missed, so
  // it waits for the farm to wake.
  withdrawal_changed: { when: "immediate" },
  // Running low is worth knowing today, not worth waking anybody for: it waits for the digest
  // (notification channels: low feed stock → Manager, digest).
  low_stock: { when: "digest" },
  // Money waiting for the Owner has already moved — the milk left, the bull arrived — so it is the
  // evening's reading, not a buzz (notification channels: Money Event awaiting approval → Owner, digest).
  money_awaiting_approval: { when: "digest" },
  // Ninety days is time enough: the Owner reads it with the evening's post (notification channels: DLS
  // renewal due → Owner, digest).
  registration_renewal_due: { when: "digest" },
  // An Investor's paper is owed, not overdue: the Owner writes it when she sits down to the evening's
  // post, and a phone that buzzes for a letter is a phone nobody answers for a withdrawal.
  investor_statement_due: { when: "digest" },
  // A month's Reimbursement owed: the Owner moves it from the bank when she sits down to the evening's post — a
  // transfer due is not a buzz, and the Farm has carried the feed all month already.
  reimbursement_due: { when: "digest" },
  // The farm's own machinery going quiet: nothing raising the day's work, or nothing copying the records off the
  // machine. The Owner hears at once, because every hour of either is an hour nobody else will notice — but not by
  // text and not at night: it is not a cow or a deadline, and the records are still there in the morning.
  day_not_turning: { when: "immediate" },
  backup_overdue: { when: "immediate" },
  // The store going off, and running low, are the evening's reading, as feed running low is: worth knowing today,
  // not worth a buzz.
  lot_expiring: { when: "digest" },
  lot_expired: { when: "digest" },
  medicine_low_stock: { when: "digest" },
  // A dose already given from a box past its day is about an animal, and the Vet hears of it at once — but it has
  // happened, and waking anybody would not un-give it.
  expired_dose_given: { when: "immediate" },
  // Somebody asking to join is work waiting for the Owner, like money waiting for approval: the evening's reading. A
  // request made at eleven at night wakes nobody.
  join_requested: { when: "digest" },
  // A buyer gone past the day he promised is a call to make today, not a buzz: the farm is told once, in the evening's
  // post, and never the buyer (the Owner, 2026-09-29).
  receivable_overdue: { when: "digest" },
  // An animal the round could not find may be on a lorry to a haat: the Owner and the Manager hear at once, by push
  // and not by text (the Owner, 2026-09-29). Not at night — the round is walked in the morning.
  animal_missing: { when: "immediate" },
  // A count come up short has happened: the evening's reading, with the figure to ask the Manager about tomorrow.
  store_shortfall: { when: "digest" },
  // Several animals in one Pen with sores on the mouth or feet: what FMD looks like before the Vet has seen it. Told at
  // once, because it spreads through a Pen in days and the Vet visits weekly (the Owner, 2026-09-29) — but not at night:
  // the round that saw it is walked in the morning.
  pen_sores_seen: { when: "immediate" },
  // Milk gone that nobody can account for is the evening's reading: a figure to ask about tomorrow, not a buzz.
  milk_unaccounted: { when: "digest" },
  // A Pen that does not count right at lock-up is walked tonight, not read about in the morning.
  head_count_differs: { when: "immediate" },
  // A dose the Vet did not prescribe is the Vet's to hear of while it can still be put right: pushed at once.
  dose_not_prescribed: { when: "immediate" },
  // Feed bought dearer than last time is a question for the Owner to ask the Manager tomorrow, not a buzz.
  feed_price_jump: { when: "digest" },
  // A count short is the evening's question for the Owner to ask the Manager, as a short store is.
  cash_short: { when: "digest" },
  // A bull weighing under what he was bought at is the evening's question for the Owner to ask the Manager who bought him.
  arrival_weight_short: { when: "digest" },
  // A bull that lost more than the farm allows on the way to the sale is the evening's question for the Owner.
  large_shrink: { when: "digest" },
  // A death or a cull is the Owner's to hear at once — a bull sold on the quiet and written "died" is caught the day it
  // happens or not at all. At once, but it does not wake the farm: the quiet hours hold its push till morning.
  mortality_recorded: { when: "immediate" },
  // A death nobody had diagnosed is the Vet's to look at, the same day: at once, held through the quiet hours.
  mortality_undiagnosed: { when: "immediate" },
  // A Monthly Sum missed is the evening's for the Owner, who rings the man: the farm reminds him, the app never does.
  monthly_sum_missed: { when: "digest" },
  // Money entered twice on purpose is the evening's question for the Owner, not a buzz: it may well be two bills.
  entered_twice: { when: "digest" },
  // A sale gone cheap is the evening's question for the Owner to ask about, never a buzz at the haat.
  sold_under_cost: { when: "digest" },
  // Animals still here after their Eid are the evening's news for the Owner and the Manager: the next market is a
  // decision, not a buzz.
  still_here_after_eid: { when: "digest" },
  // Medicine the count did not find is the evening's question for the Owner, as a short store is.
  medicine_short: { when: "digest" },
} as const satisfies Record<AlertKind, Delivery>;

/** What one kind says. Whether it says anything in a text message is not this table's decision but the delivery
 *  table's: a kind marked for texting must have the words for it, and a kind not marked must not have them. */
type Saying<Kind extends AlertKind> = {
  /** In the farm's own list, which every Notice reaches whether or not it travelled. */
  app: MessageKey;
  /** In a pocket, for the kinds that go now — a title and a line under it. */
  push?: { title: MessageKey; body: MessageKey };
  /** In the evening's post: so many of this, so many of that. */
  digest: MessageKey;
} & ((typeof DELIVERY)[Kind] extends { sms: true }
  ? { sms: MessageKey }
  : { sms?: never });

/**
 * What each kind of Notice says, wherever it is said: in the farm's own list, in a pocket, in the evening's post, and
 * in the two that also go by text.
 *
 * One table over every kind, beside the one that says when each goes, because a kind given a delivery and no words is
 * a notice that arrives as its own name. What the words are *filled with* is the Notice's facts, which the farm stores
 * as it raised them.
 */
export const SAYS: { [Kind in AlertKind]: Saying<Kind> } = {
  instance_overdue: {
    app: "alerts.instanceOverdue",
    push: { title: "push.overdueTitle", body: "alerts.instanceOverdue" },
    digest: "digest.overdue",
  },
  instance_escalated: {
    app: "alerts.instanceEscalated",
    push: { title: "push.escalatedTitle", body: "alerts.instanceEscalated" },
    digest: "digest.escalated",
  },
  instance_sent_back: {
    app: "alerts.instanceSentBack",
    push: { title: "push.sentBackTitle", body: "alerts.instanceSentBack" },
    digest: "digest.sentBack",
  },
  needs_review: { app: "alerts.needsReview", digest: "digest.needsReview" },
  sop_published: { app: "alerts.sopPublished", digest: "digest.sopPublished" },
  sop_proposed: { app: "alerts.sopProposed", digest: "digest.sopProposed" },
  sop_retired: { app: "alerts.sopRetired", digest: "digest.sopRetired" },
  sop_restored: { app: "alerts.sopRestored", digest: "digest.sopRestored" },
  // Its digest words are never carried — it goes the moment it is raised — but the table is over every kind, so a
  // new one cannot be forgotten here.
  withdrawal_ending: {
    app: "alerts.withdrawalEnding",
    digest: "digest.withdrawalEnding",
    sms: "sms.withdrawalEnding",
  },
  notifiable_diagnosis: {
    app: "alerts.notifiableDiagnosis",
    digest: "digest.notifiable",
    sms: "sms.notifiableDiagnosis",
  },
  entry_rejected: {
    app: "alerts.entryRejected",
    push: {
      title: "push.entryRejectedTitle",
      body: "push.entryRejectedBody",
    },
    digest: "digest.entryRejected",
  },
  withdrawal_changed: {
    app: "alerts.withdrawalChanged",
    push: {
      title: "push.withdrawalChangedTitle",
      body: "push.withdrawalChangedBody",
    },
    digest: "digest.withdrawalChanged",
  },
  low_stock: { app: "alerts.lowStock", digest: "digest.lowStock" },
  investor_statement_due: {
    app: "alerts.investorStatementDue",
    digest: "digest.investorStatementDue",
  },
  reimbursement_due: {
    app: "alerts.reimbursementDue",
    digest: "digest.reimbursementDue",
  },
  money_awaiting_approval: {
    app: "alerts.moneyAwaiting",
    digest: "digest.moneyAwaiting",
  },
  registration_renewal_due: {
    app: "alerts.registrationRenewal",
    digest: "digest.registrationRenewal",
  },
  day_not_turning: {
    app: "alerts.dayNotTurning",
    push: { title: "push.dayNotTurningTitle", body: "push.dayNotTurningBody" },
    digest: "digest.dayNotTurning",
  },
  backup_overdue: {
    app: "alerts.backupOverdue",
    push: { title: "push.backupOverdueTitle", body: "push.backupOverdueBody" },
    digest: "digest.backupOverdue",
  },
  lot_expiring: { app: "alerts.lotExpiring", digest: "digest.lotExpiring" },
  lot_expired: { app: "alerts.lotExpired", digest: "digest.lotExpired" },
  medicine_low_stock: {
    app: "alerts.medicineLowStock",
    digest: "digest.medicineLowStock",
  },
  expired_dose_given: {
    app: "alerts.expiredDoseGiven",
    push: {
      title: "push.expiredDoseTitle",
      body: "push.expiredDoseBody",
    },
    digest: "digest.expiredDoseGiven",
  },
  join_requested: {
    app: "alerts.joinRequested",
    digest: "digest.joinRequested",
  },
  receivable_overdue: {
    app: "alerts.receivableOverdue",
    digest: "digest.receivableOverdue",
  },
  animal_missing: {
    app: "alerts.animalMissing",
    push: { title: "push.animalMissingTitle", body: "push.animalMissingBody" },
    digest: "digest.animalMissing",
  },
  store_shortfall: {
    app: "alerts.storeShortfall",
    digest: "digest.storeShortfall",
  },
  pen_sores_seen: {
    app: "alerts.penSoresSeen",
    push: { title: "push.penSoresSeenTitle", body: "push.penSoresSeenBody" },
    digest: "digest.penSoresSeen",
  },
  milk_unaccounted: {
    app: "alerts.milkUnaccounted",
    digest: "digest.milkUnaccounted",
  },
  dose_not_prescribed: {
    app: "alerts.doseNotPrescribed",
    push: {
      title: "push.doseNotPrescribedTitle",
      body: "push.doseNotPrescribedBody",
    },
    digest: "digest.doseNotPrescribed",
  },
  head_count_differs: {
    app: "alerts.headCountDiffers",
    push: {
      title: "push.headCountDiffersTitle",
      body: "push.headCountDiffersBody",
    },
    digest: "digest.headCountDiffers",
  },
  feed_price_jump: {
    app: "alerts.feedPriceJump",
    digest: "digest.feedPriceJump",
  },
  mortality_undiagnosed: {
    app: "alerts.mortalityUndiagnosed",
    push: {
      title: "push.mortalityRecordedTitle",
      body: "alerts.mortalityUndiagnosed",
    },
    digest: "digest.mortalityUndiagnosed",
  },
  mortality_recorded: {
    app: "alerts.mortalityRecorded",
    push: {
      title: "push.mortalityRecordedTitle",
      body: "alerts.mortalityRecorded",
    },
    digest: "digest.mortalityRecorded",
  },
  large_shrink: {
    app: "alerts.largeShrink",
    digest: "digest.largeShrink",
  },
  arrival_weight_short: {
    app: "alerts.arrivalWeightShort",
    digest: "digest.arrivalWeightShort",
  },
  cash_short: {
    app: "alerts.cashShort",
    digest: "digest.cashShort",
  },
  monthly_sum_missed: {
    app: "alerts.monthlySumMissed",
    digest: "digest.monthlySumMissed",
  },
  entered_twice: {
    app: "alerts.enteredTwice",
    digest: "digest.enteredTwice",
  },
  sold_under_cost: {
    app: "alerts.soldUnderCost",
    digest: "digest.soldUnderCost",
  },
  still_here_after_eid: {
    app: "alerts.stillHereAfterEid",
    digest: "digest.stillHereAfterEid",
  },
  medicine_short: {
    app: "alerts.medicineShort",
    digest: "digest.medicineShort",
  },
};

export const goesNow = (kind: AlertKind): boolean =>
  DELIVERY[kind].when === "immediate";

export const waitsForTheDigest = (kind: AlertKind): boolean =>
  DELIVERY[kind].when === "digest";

/** Is this one of the two worth a text message as well? */
export const goesByText = (kind: AlertKind): boolean =>
  (DELIVERY[kind] as Delivery).sms === true;

/** May this notice buzz a phone while the farm is asleep? Only the safety ones may. */
export const wakesTheFarm = (kind: AlertKind): boolean =>
  (DELIVERY[kind] as Delivery).wakesTheFarm === true;

const MINUTES_PER_HOUR = 60;

/** "HH:MM" as minutes since the farm's midnight. */
export const minutesInTheDay = (time: string): number => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * MINUTES_PER_HOUR + minute;
};

export interface QuietHours {
  /** "22:00" — from this time of the farm's day. */
  from: string;
  /** "05:00" — until this time of the next one. */
  until: string;
}

/**
 * Is the farm asleep at this time of day? The window runs over midnight, which is the whole
 * point of it: nothing that can wait should buzz a phone at one in the morning.
 */
export const isQuiet = (minuteOfDay: number, quiet: QuietHours): boolean => {
  const from = minutesInTheDay(quiet.from);
  const until = minutesInTheDay(quiet.until);
  if (from === until) {
    return false;
  }
  return from < until
    ? minuteOfDay >= from && minuteOfDay < until
    : minuteOfDay >= from || minuteOfDay < until;
};

/**
 * The times of day the farm's post is actually carried, in minutes since its midnight.
 *
 * A digest time inside quiet hours is not a carrying moment: it waits for the farm to wake,
 * because a batch of things that could wait is exactly what quiet hours are for. Two digest
 * times that both fall asleep collapse into one waking moment, which is what a person would
 * expect — they are woken once.
 */
export const carryingMoments = (
  times: readonly string[],
  quiet: QuietHours
): number[] => {
  const moments = times.map((time) => {
    const at = minutesInTheDay(time);
    return isQuiet(at, quiet) ? minutesInTheDay(quiet.until) : at;
  });
  return [...new Set(moments)].toSorted((a, b) => a - b);
};

/**
 * The most recent moment the post should have been carried, at or before this minute of the
 * farm's day — or null if the day has not reached one yet, in which case yesterday's last
 * moment is what the caller should look back to.
 *
 * What makes this a digest rather than a running commentary: everything raised *before* that
 * moment goes now, and everything raised since waits for the next one.
 */
export const lastCarryingMoment = (
  minuteOfDay: number,
  times: readonly string[],
  quiet: QuietHours
): number | null => {
  const passed = carryingMoments(times, quiet).filter(
    (moment) => moment <= minuteOfDay
  );
  return passed.at(-1) ?? null;
};
