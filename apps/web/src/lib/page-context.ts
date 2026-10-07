import type { Host } from "@OpenFarm/auth/hosts";
import type { FarmLocale, Language } from "@OpenFarm/i18n";
import {
  DEFAULT_FARM_LOCALE,
  DEFAULT_LANGUAGE,
  isLanguage,
  farmLocale,
  isCountry,
  isCurrencyCode,
  isTimeZone,
} from "@OpenFarm/i18n";
import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * What the server entry tells the app about the answer it is writing, in the request's own context — never read from
 * anything the caller sent: which of the farm's two addresses the page is on, and the nonce its policy lets inline
 * scripts run by (ADR 0009).
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

/** Where the server writes where the farm is — its currency, its time zone and its country — for the browser to read
 *  back. */
export const CURRENCY_ATTRIBUTE = "data-currency";
export const TIME_ZONE_ATTRIBUTE = "data-time-zone";
export const COUNTRY_ATTRIBUTE = "data-country";

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
    const country = root.getAttribute(COUNTRY_ATTRIBUTE) ?? "";
    return {
      currency: isCurrencyCode(currency)
        ? currency
        : DEFAULT_FARM_LOCALE.currency,
      timeZone: isTimeZone(timeZone) ? timeZone : DEFAULT_FARM_LOCALE.timeZone,
      country: isCountry(country) ? country : DEFAULT_FARM_LOCALE.country,
    };
  });

/** The cookie the reader's language is kept in beside the device's storage, so the server can write the page in it
 *  from the start (`language-provider.tsx` writes it). */
export const LANGUAGE_COOKIE = "openfarm.language";

const LANGUAGE_IN_COOKIE = new RegExp(
  String.raw`(?:^|;\s*)${LANGUAGE_COOKIE.replaceAll(".", String.raw`\.`)}=(?<language>[a-z]+)`,
  "u"
);

/**
 * The language the page is written in: on the server, the reader's from their cookie (the farm's default for a first
 * visit or a browser that keeps no such cookie); in the browser, what the server wrote on the page's root. An English
 * reader's page was drawn in Bangla, then again in English, once the browser had read their choice.
 */
export const pageLanguage = createIsomorphicFn()
  .server((): Language => {
    const kept = getRequest().headers.get("cookie")?.match(LANGUAGE_IN_COOKIE)
      ?.groups?.language;
    return isLanguage(kept) ? kept : DEFAULT_LANGUAGE;
  })
  .client((): Language => {
    const written = document.documentElement.lang;
    return isLanguage(written) ? written : DEFAULT_LANGUAGE;
  });
