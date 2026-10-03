// What a phone and the farm must agree on, written once: a phone that sends more than the farm takes, or locks later
// than the farm expects, fails in a shed with nobody to ask why.

/** How much one batch from a phone's Outbox may carry: the farm refuses more, and the phone sends no more. A phone out
 *  of signal for a week has plenty to send, but one transaction should stay a size a farm's database can hold. */
export const SYNC_BATCH_MAX = 200;

/** Minutes of inactivity before a Shed Phone locks and asks for a PIN again, until the farm says otherwise. */
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
