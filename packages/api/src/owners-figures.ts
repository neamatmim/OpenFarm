// The Farm's settings that are the Owner's alone to read, not only to set: what a Venture is planned by, what the Owner
// judges a kilo fetches, and the lines past which the Manager's counts are told to the Owner. A Manager who knew how
// short the cash may be before the Owner hears could stay under it. Read by every door the farm's settings leave by —
// `farm.current` and the audit trail — so none of them is opened without the others.

/** The Parameters a Venture is planned and watched by, which are the Owner's to set as the Venture is
 *  hers. The rest are the running of the farm, which the Manager keeps. */
export const A_VENTURES_OWN = [
  "ventureFloorPercent",
  "ventureRunningPercent",
  "ventureInvestorsPercent",
  "windUpDays",
  "priceWeighInDays",
  "adjustmentThresholdMoney",
  "investorCap",
  "investorWarnAt",
  "runningBudgetWarnMoney",
] as const;

/** When a count's shortfall is told: the Owner's to set, as the count is the one check on the Manager's feed. */
export const WHEN_A_SHORT_STORE_IS_TOLD = [
  "storeShortfallTellMoney",
  // Milk nobody can account for is checked on the Manager, as the store is.
  "milkUnaccountedPercent",
  // And what the Manager paid for the feed.
  "feedPriceJumpPercent",
  // And the weight the Manager bought a bull at.
  "arrivalShortPercent",
  // And the weight he sold one at.
  "shrinkTellPercent",
  // And the cash in the Manager's hand.
  "cashShortTellMoney",
  // And the medicine the Manager buys and counts.
  "medicineShortTellMoney",
] as const;

/** What the Owner judges a kilo of live weight fetches: what `fattening.prices` keeps the Owner's. */
const THE_MARKET_PRICE = [
  "marketLowMoneyPerKg",
  "marketHighMoneyPerKg",
  "marketPriceSetAt",
] as const;

/** Every one of the Farm's settings that is the Owner's alone to read. */
export const THE_OWNERS_FIGURES = [
  ...A_VENTURES_OWN,
  ...WHEN_A_SHORT_STORE_IS_TOLD,
  ...THE_MARKET_PRICE,
] as const;

export type OwnersFigure = (typeof THE_OWNERS_FIGURES)[number];

const isTheOwners = (key: string): boolean =>
  (THE_OWNERS_FIGURES as readonly string[]).includes(key);

/** The Farm's settings, or a snapshot of some of them, less what is the Owner's alone to read. */
export const withoutTheOwnersFigures = <
  Settings extends Record<string, unknown>,
>(
  settings: Settings
): Omit<Settings, OwnersFigure> =>
  Object.fromEntries(
    Object.entries(settings).filter(([key]) => !isTheOwners(key))
  ) as Omit<Settings, OwnersFigure>;

/** Only what is the Owner's alone to read of the Farm's settings. */
export const theOwnersFigures = <
  Settings extends Record<OwnersFigure, unknown>,
>(
  settings: Settings
): Pick<Settings, OwnersFigure> =>
  Object.fromEntries(
    THE_OWNERS_FIGURES.map((key) => [key, settings[key]])
  ) as Pick<Settings, OwnersFigure>;

/** Whether a snapshot of the Farm's settings says anything but what is the Owner's alone. */
export const saysMoreThanTheOwners = (settings: Record<string, unknown>) =>
  Object.keys(settings).some((key) => !isTheOwners(key));
