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
}

/** The longest a withdrawal is ever going to be. Beyond this it is a typo, not a product. */
export const MAX_WITHDRAWAL_DAYS = 365;

export const mayBePrescribed = (product: WithdrawalDays): boolean =>
  product.milkWithdrawalDays !== null && product.meatWithdrawalDays !== null;

/** Why this product may not be prescribed, in the words somebody would use. */
export const whyNotPrescribable = (product: WithdrawalDays): string | null => {
  if (mayBePrescribed(product)) {
    return null;
  }
  return "This product has no withdrawal days written down, so nothing may be prescribed from it until the Vet fills them in";
};

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
