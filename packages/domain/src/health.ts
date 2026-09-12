/**
 * What the farm may prescribe, and what it may not.
 *
 * A product with either withdrawal figure blank cannot be prescribed. That is not a
 * technicality: the withdrawal days are the only thing standing between a treated cow and
 * the bulk tank, and a farm that guesses them is a farm selling milk it cannot say is safe.
 */
export interface WithdrawalDays {
  milkWithdrawalDays: number | null;
  meatWithdrawalDays: number | null;
  retiredAt?: Date | null;
}

/** Why a product may not be prescribed. A reason rather than a sentence: the words belong
 *  to whoever is reading, and this package has no language of its own. */
export type NotPrescribable = "no_withdrawal_days" | "retired";

/** The longest a withdrawal is ever going to be. Beyond this it is a typo, not a product. */
export const MAX_WITHDRAWAL_DAYS = 365;

/**
 * Why this product may not be prescribed, or null when it may.
 *
 * One answer, asked by the list that shows the product and by the refusal when somebody
 * tries to prescribe from it — so the screen and the server cannot give different reasons
 * for the same thing.
 */
export const whyNotPrescribable = (
  product: WithdrawalDays
): NotPrescribable | null => {
  if (product.retiredAt) {
    return "retired";
  }
  if (
    product.milkWithdrawalDays === null ||
    product.meatWithdrawalDays === null
  ) {
    return "no_withdrawal_days";
  }
  return null;
};

export const mayBePrescribed = (product: WithdrawalDays): boolean =>
  whyNotPrescribable(product) === null;

/** What is wrong with the days somebody has entered. */
export const findWithdrawalProblems = (days: {
  milkWithdrawalDays: number;
  meatWithdrawalDays: number;
}): string[] => {
  const problems: string[] = [];
  for (const [what, value] of [
    ["milk", days.milkWithdrawalDays],
    ["meat", days.meatWithdrawalDays],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_WITHDRAWAL_DAYS) {
      problems.push(
        `${what}: whole days, from none up to ${MAX_WITHDRAWAL_DAYS}`
      );
    }
  }
  return problems;
};

/**
 * How a dose goes in. The same list as the column's own enum in the schema — the database
 * package does not depend on this one, so both say it, as milk's destinations do.
 */
export const ROUTES = [
  "intramuscular",
  "intravenous",
  "subcutaneous",
  "oral",
  "intramammary",
  "topical",
] as const;
export type DoseRoute = (typeof ROUTES)[number];

/** A course may not run for ever: a Prescription is a treatment, not a regime. */
export const MAX_COURSE_DAYS = 30;
/** Four times a day is as often as a farm gives anything by hand. */
export const MAX_TIMES_A_DAY = 4;
