import type { AlertKind } from "./alerts";

/**
 * How each kind of notice reaches a person, in one place.
 *
 * **Immediate** is the Alert proper: it goes now, into a pocket, through quiet hours,
 * because it costs money or breaks a legal deadline if it waits. **Digest** is everything
 * else — true, worth knowing, and no worse for arriving at six with the rest.
 *
 * Typed by the kind, so a new kind of notice cannot be added without somebody deciding
 * which of the two it is. That decision is the whole of the farm's notification table.
 */
/**
 * The farm's delivery table: when each kind of notice goes, and whether it is one of the two
 * worth a text message as well.
 *
 * One table, because "what goes by SMS" is a delivery decision like any other and a second list
 * somewhere else is how a farm ends up texting people about a feed digest. Two kinds carry
 * `sms`, and they are the two that cost money or break a legal deadline if they are missed.
 */
export const DELIVERY: Record<
  AlertKind,
  {
    when: "immediate" | "digest";
    /** Also worth a text message, to the Owner and the Manager. */
    sms?: true;
    /** May wake the farm: quiet hours are 22:00–05:00 and safety alerts are the exception,
     *  which means these and nothing else. Everything else still reaches the app at once — the
     *  quiet is on the phone, not on the record. */
    wakesTheFarm?: true;
  }
> = {
  instance_overdue: { when: "immediate" },
  instance_escalated: { when: "immediate" },
  instance_sent_back: { when: "immediate" },
  needs_review: { when: "digest" },
  sop_published: { when: "digest" },
  sop_proposed: { when: "digest" },
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
};

/**
 * What each kind of Notice says, wherever it is said: in the farm's own list, in a pocket, in the evening's post, and
 * in the two that also go by text.
 *
 * One table over every kind, beside the one that says when each goes, because a kind given a delivery and no words is
 * a notice that arrives as its own name. What the words are *filled with* is the Notice's facts, which the farm stores
 * as it raised them.
 */
export const SAYS: Record<
  AlertKind,
  {
    /** In the farm's own list, which every Notice reaches whether or not it travelled. */
    app: string;
    /** In a pocket, for the kinds that go now — a title and a line under it. */
    push?: { title: string; body: string };
    /** In the evening's post: so many of this, so many of that. */
    digest: string;
    /** In a text message, for the two that cost money or break a deadline if they are missed. */
    sms?: string;
  }
> = {
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
  money_awaiting_approval: {
    app: "alerts.moneyAwaiting",
    digest: "digest.moneyAwaiting",
  },
  registration_renewal_due: {
    app: "alerts.registrationRenewal",
    digest: "digest.registrationRenewal",
  },
};

export const goesNow = (kind: AlertKind): boolean =>
  DELIVERY[kind].when === "immediate";

export const waitsForTheDigest = (kind: AlertKind): boolean =>
  DELIVERY[kind].when === "digest";

/** Is this one of the two worth a text message as well? */
export const goesByText = (kind: AlertKind): boolean =>
  DELIVERY[kind].sms === true;

/** May this notice buzz a phone while the farm is asleep? Only the safety ones may. */
export const wakesTheFarm = (kind: AlertKind): boolean =>
  DELIVERY[kind].wakesTheFarm === true;

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
