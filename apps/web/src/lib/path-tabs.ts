import { useLocation } from "@tanstack/react-router";

/** One path parameter in a route's path, `$tagNumber`. */
const PARAM = /\$(?<name>\w+)/gu;

/** A route's path with its parameters filled in, as the address bar shows it. */
const filledIn = (path: string, params: Record<string, string>): string =>
  path.replaceAll(PARAM, (_, name: string) =>
    encodeURIComponent(params[name] ?? "")
  );

/** An address without the slash a browser may leave on its end. */
const trimmed = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

/**
 * Which tab a page's address is on, for a page whose tabs each have an address of their own — `/money` and
 * `/money/receivables` (docs/research/route-naming-audit.md, section 3). The page is a layout that draws every tab
 * itself, so what the tabs share — a period, a query, a sheet left open — stays put as the reader moves between
 * them, and each tab's own route file only gives it its address.
 *
 * `paths` gives each tab its route path, the first tab's being the page's own. Undefined when the address is none of
 * them: a page further down, such as an SOP's card under `/sops`, which the layout then hands to its `<Outlet />`.
 */
export const useTabOfPath = <T extends string>(
  paths: Readonly<Record<T, string>>,
  params: Record<string, string> = {}
): T | undefined => {
  const { pathname } = useLocation();
  const here = trimmed(decodeURIComponent(pathname));
  return (Object.keys(paths) as T[]).find(
    (tab) => decodeURIComponent(filledIn(paths[tab], params)) === here
  );
};

/**
 * How a page's tabs change its address: in place, so Back leaves the page rather than stepping through its tabs, and
 * without the router's jump to the top, because `PageTabs` puts the reader where they were in the tab they go to.
 */
export const TAB_SWITCH = { replace: true, resetScroll: false } as const;
