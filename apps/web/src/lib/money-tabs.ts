/** The money page's tabs, in the order they stand. */
export const MONEY_TABS = [
  "register",
  "cash",
  "draws",
  "receivable",
  "supplierPayments",
  "costs",
  "accountant",
] as const;
export type MoneyTab = (typeof MONEY_TABS)[number];

/** The tabs that read the period above them. The hands, the draws and what buyers owe are held now, and the bills to pay
 *  are by when they fall due, so the period and its totals would stand over figures that never read them. */
const READ_THE_PERIOD: ReadonlySet<MoneyTab> = new Set([
  "register",
  "costs",
  "accountant",
]);

/** Whether this tab reads the period, so the period and its totals stand above it. */
export const readsThePeriod = (tab: MoneyTab): boolean =>
  READ_THE_PERIOD.has(tab);
