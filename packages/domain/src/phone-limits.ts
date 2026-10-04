// What a phone and the farm must agree on, written once: a phone that sends more than the farm takes, or locks later
// than the farm expects, fails in a shed with nobody to ask why.

/** How much one batch from a phone's Outbox may carry: the farm refuses more, and the phone sends no more. A phone out
 *  of signal for a week has plenty to send, but one transaction should stay a size a farm's database can hold. */
export const SYNC_BATCH_MAX = 200;

/** And the most it may weigh, as its entries are written out: a shed photo is a megabyte or so of base64, and two
 *  hundred of them would be a request no phone on a weak signal will ever finish. What does not fit goes in the next
 *  batch — but a single entry heavier than this still goes, alone, since it has to go some time. */
export const SYNC_BATCH_MAX_BYTES = 4_000_000;

/** Whether a batch weighs more than a phone would ever send. The farm reads the entries it parsed, a little lighter or
 *  heavier than the phone's own reading of them, so it allows a tenth over. */
export const heavierThanAPhoneSends = (entries: readonly unknown[]): boolean =>
  entries.length > 1 &&
  entries.reduce<number>(
    (total, entry) => total + JSON.stringify(entry).length,
    0
  ) >
    SYNC_BATCH_MAX_BYTES * 1.1;

/** Minutes of inactivity before a Shed Phone locks and asks for a PIN again, until the farm says otherwise. */
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
