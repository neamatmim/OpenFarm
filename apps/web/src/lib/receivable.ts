import { roundMoney } from "@OpenFarm/domain";

// What is typed about Receivable on the Sale and Dispatch sheets, and what the farm is sent of it. Here rather than beside the
// fields, because these are sums, and a sum is easier read — and checked — away from the markup.

/**
 * What is typed about **Receivable** as an animal or the milk leaves: whether anything is still owed, what the buyer paid
 * there and then, and the day he promised to pay the rest by.
 */
export interface ReceivableTyped {
  owed: boolean;
  paidNow: string;
  promisedBy: string;
}

/** Paid in full, as nearly every buyer at the gate is. */
export const NO_RECEIVABLE: ReceivableTyped = {
  owed: false,
  paidNow: "",
  promisedBy: "",
};

/** What the farm is sent of it: nothing at all for a buyer who paid in full, which the farm reads as paid in full. */
export const receivableSent = (
  typed: ReceivableTyped
): { paidNowMoney?: number; promisedBy?: string } =>
  typed.owed
    ? {
        paidNowMoney: Number(typed.paidNow),
        promisedBy: typed.promisedBy || undefined,
      }
    : {};

/** Whether enough is typed of it to save: what was paid, no more than it came to, and a day where one is asked for. */
export const receivableComplete = (
  typed: ReceivableTyped,
  worthMoney: number,
  promiseRequired: boolean
): boolean => {
  if (!typed.owed) {
    return true;
  }
  const paid = Number(typed.paidNow);
  const paidIsAFigure =
    typed.paidNow.trim() !== "" && !Number.isNaN(paid) && paid >= 0;
  const promised = !promiseRequired || typed.promisedBy !== "";
  return paidIsAFigure && paid <= worthMoney && promised;
};

/** Whether anything was paid at the gate, so how it was paid is worth asking. Still asked while what he paid is not
 *  yet typed: the box goes only once nothing is said to have been paid, not the moment the tick is made. */
export const somethingPaid = (typed: ReceivableTyped): boolean =>
  !typed.owed || typed.paidNow.trim() === "" || Number(typed.paidNow) > 0;

/** What the buyer still owes as it is typed: what it came to less what he paid, or nothing while what he paid is not
 *  yet a figure the farm would take. */
export const stillOwes = (
  typed: ReceivableTyped,
  worthMoney: number
): number | null => {
  const paid = Number(typed.paidNow);
  const paidIsAFigure =
    typed.paidNow.trim() !== "" && !Number.isNaN(paid) && paid >= 0;
  return paidIsAFigure && paid <= worthMoney
    ? roundMoney(worthMoney - paid)
    : null;
};
