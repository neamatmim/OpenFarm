/**
 * What the portal's pages read from the address — which view is open — kept apart from the pages themselves: a route
 * checks its address before its page is drawn, and a check that lived in the page brought the whole page into the
 * first download of every screen, the shed's included.
 */

export const ACCOUNT_TABS = ["details", "security"] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

/** What the address may say about the account page: which of its views is open. */
export interface AccountSearch {
  tab?: AccountTab;
}

/** The address's word on which view is open, in the portal and in the Preview alike. */
export const accountSearch = (
  search: Record<string, unknown>
): AccountSearch =>
  ACCOUNT_TABS.includes(search.tab as AccountTab) && search.tab !== "details"
    ? { tab: search.tab as AccountTab }
    : {};

export const VENTURE_TABS = ["animals", "spending", "papers"] as const;
export type VentureTab = (typeof VENTURE_TABS)[number];

/** What the address may say about a Venture's page: which of its views is open. */
export interface VentureSearch {
  tab?: VentureTab;
}

/** The address's word on which view is open, in the portal and in the Preview alike. */
export const ventureSearch = (
  search: Record<string, unknown>
): VentureSearch =>
  VENTURE_TABS.includes(search.tab as VentureTab) && search.tab !== "animals"
    ? { tab: search.tab as VentureTab }
    : {};

export const YOUR_VENTURES_TABS = ["running", "finished"] as const;
export type YourVenturesTab = (typeof YOUR_VENTURES_TABS)[number];

/** What the address may say about the list of Ventures: which of its two tabs is open. */
export interface YourVenturesSearch {
  tab?: YourVenturesTab;
}

/** The address's word on which tab is open, in the portal and in the Preview alike. */
export const yourVenturesSearch = (
  search: Record<string, unknown>
): YourVenturesSearch =>
  YOUR_VENTURES_TABS.includes(search.tab as YourVenturesTab)
    ? { tab: search.tab as YourVenturesTab }
    : {};
