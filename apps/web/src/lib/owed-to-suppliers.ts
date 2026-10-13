/** A month as the phone may hold it: where it says what the farm owed its Suppliers at its end, if it says it at all. */
interface MonthKept {
  atEnd?: { owedToSuppliers?: { owingMoney: number } };
}

/**
 * Whether a month's page says what the farm owed its Suppliers — the part, its line at a glance and the capital's line
 * taking it off: where this month or the month before owed them something, as the paper does. A month the phone kept
 * from before it was said owed, as far as it can tell, nothing.
 */
export const owedSuppliersIn = (...months: readonly MonthKept[]): boolean =>
  months.some((one) => (one.atEnd?.owedToSuppliers?.owingMoney ?? 0) > 0);
