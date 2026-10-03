import type { Host } from "@OpenFarm/auth/hosts";
import type { FarmLocale } from "@OpenFarm/i18n";
import {
  DEFAULT_FARM_LOCALE,
  farmLocale,
  isCurrencyCode,
  isTimeZone,
} from "@OpenFarm/i18n";
import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start";

/**
 * What the server entry tells the app about the answer it is writing, in the request's own context — never read from
 * anything the caller sent: which of the farm's two addresses the page is on, and on the Investor address the nonce
 * its policy lets inline scripts run by (ADR 0009).
 */
export interface PageContext {
  host?: Host;
  nonce?: string;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: PageContext };
  }
}

/** Where the server writes which address the page is on, for the browser to read back. */
export const HOST_ATTRIBUTE = "data-host";

/** This answer's nonce, while the server writes the page; nothing in the browser, which writes no inline script. */
export const pageNonce = createIsomorphicFn()
  .server(() => getGlobalStartContext()?.nonce)
  .client((): string | undefined => undefined);

/**
 * Which of the farm's addresses the page is on: the server's own word while it writes the page, and in the browser
 * what it wrote on the page's root — the farm's where it wrote nothing.
 */
export const pageHost = createIsomorphicFn()
  .server((): Host => getGlobalStartContext()?.host ?? "farm")
  .client((): Host =>
    document.documentElement.getAttribute(HOST_ATTRIBUTE) === "portal"
      ? "portal"
      : "farm"
  );

/** Where the server writes where the farm is — its currency and its time zone — for the browser to read back. */
export const CURRENCY_ATTRIBUTE = "data-currency";
export const TIME_ZONE_ATTRIBUTE = "data-time-zone";

/**
 * Where the farm is (ADR 0013): the server's own setting while it writes the page, and in the browser what it wrote on
 * the page's root — so a phone opening the page it kept, with no signal, reads its sums and days as the server would.
 * A page kept from before the server wrote either is read as a farm in Bangladesh, as it was then.
 */
export const pageFarmLocale = createIsomorphicFn()
  .server((): FarmLocale => farmLocale())
  .client((): FarmLocale => {
    const root = document.documentElement;
    const currency = root.getAttribute(CURRENCY_ATTRIBUTE) ?? "";
    const timeZone = root.getAttribute(TIME_ZONE_ATTRIBUTE) ?? "";
    return {
      currency: isCurrencyCode(currency)
        ? currency
        : DEFAULT_FARM_LOCALE.currency,
      timeZone: isTimeZone(timeZone) ? timeZone : DEFAULT_FARM_LOCALE.timeZone,
    };
  });
