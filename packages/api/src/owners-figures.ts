import type { OwnersAloneToRead } from "@OpenFarm/domain";
import { parametersOwnersAloneRead } from "@OpenFarm/domain";

// The Farm's settings that are the Owner's alone to read, not only to set: what a Venture is planned by, what the Owner
// judges a kilo fetches, and the lines past which the Manager's counts are told to the Owner. A Manager who knew how
// short the cash may be before the Owner hears could stay under it. Read by every door the farm's settings leave by —
// `farm.current` and the audit trail — so none of them is opened without the others.

/** What the Owner judges a kilo of live weight fetches: what `fattening.prices` keeps the Owner's. */
const THE_MARKET_PRICE = [
  "marketLowMoneyPerKg",
  "marketHighMoneyPerKg",
  "marketPriceSetAt",
] as const;

export type OwnersFigure =
  | OwnersAloneToRead
  | (typeof THE_MARKET_PRICE)[number];

/** Every one of the Farm's settings that is the Owner's alone to read: the Parameters declared so (a Venture's own
 *  figures, and the lines past which the Manager's counts are told), and the market price. */
export const THE_OWNERS_FIGURES: readonly OwnersFigure[] = [
  ...parametersOwnersAloneRead(),
  ...THE_MARKET_PRICE,
];

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
