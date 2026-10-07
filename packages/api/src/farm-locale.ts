import { isYearStart, readsMobileNumbersOf } from "@OpenFarm/domain";
import { env } from "@OpenFarm/env/server";
import {
  DEFAULT_FARM_LOCALE,
  isCurrencyCode,
  setFarmLocale,
} from "@OpenFarm/i18n";

/** The month the farm's years began in before any Year Change: July, as Bangladesh's income year does, unless the
 *  server says (ADR 0016). The browser never reads it — the server hands it the years themselves. */
const FIRST_YEAR_STARTS = 7;

let firstStarts = FIRST_YEAR_STARTS;

/** The month the farm's years began in before any Year Change, as the server was set up to say. */
export const firstYearStarts = (): number => firstStarts;

/**
 * Where the farm is, as its server was set up to say (ADR 0013): read once, before anything is written out, a farm day
 * worked out or a number read, by every way into the server — a request, the schedule, the seed. A currency or a zone
 * the farm cannot count in, or a country whose numbers it cannot read, stops the server there, rather than reading
 * every sum, every day and every number wrongly. So does a financial year that begins in no month.
 */
export const settleFarmLocale = (): void => {
  const currency = env.OPENFARM_CURRENCY ?? DEFAULT_FARM_LOCALE.currency;
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `OPENFARM_CURRENCY is ${currency}, which OpenFarm does not count money in`
    );
  }
  const country = (
    env.OPENFARM_COUNTRY ?? DEFAULT_FARM_LOCALE.country
  ).toUpperCase();
  if (!readsMobileNumbersOf(country)) {
    throw new Error(
      `OPENFARM_COUNTRY is ${country}, whose mobile numbers OpenFarm cannot read`
    );
  }
  const yearStarts = Number(env.OPENFARM_YEAR_STARTS ?? FIRST_YEAR_STARTS);
  if (!isYearStart(yearStarts)) {
    throw new Error(
      `OPENFARM_YEAR_STARTS is ${env.OPENFARM_YEAR_STARTS}, which is not a month from 1 to 12`
    );
  }
  setFarmLocale({
    currency,
    timeZone: env.OPENFARM_TIME_ZONE ?? DEFAULT_FARM_LOCALE.timeZone,
    country,
  });
  firstStarts = yearStarts;
};

/** Where the farm is as this server was set up to say: what the database is asked to agree with at start. */
export interface LocaleAsSetUp {
  currency: string;
  timeZone: string;
  yearStarts: number;
}

export const localeAsSetUp = (): LocaleAsSetUp => ({
  currency: env.OPENFARM_CURRENCY ?? DEFAULT_FARM_LOCALE.currency,
  timeZone: env.OPENFARM_TIME_ZONE ?? DEFAULT_FARM_LOCALE.timeZone,
  yearStarts: Number(env.OPENFARM_YEAR_STARTS ?? FIRST_YEAR_STARTS),
});

/** Which of the three a server set up as `now` says differently from the one the records were kept under. */
export const localeChanges = (
  kept: LocaleAsSetUp,
  now: LocaleAsSetUp
): string[] =>
  [
    kept.currency === now.currency
      ? null
      : `OPENFARM_CURRENCY ${kept.currency} → ${now.currency}`,
    kept.timeZone === now.timeZone
      ? null
      : `OPENFARM_TIME_ZONE ${kept.timeZone} → ${now.timeZone}`,
    kept.yearStarts === now.yearStarts
      ? null
      : `OPENFARM_YEAR_STARTS ${kept.yearStarts} → ${now.yearStarts}`,
  ].filter((change): change is string => change !== null);
