import { readsMobileNumbersOf } from "@OpenFarm/domain";
import { env } from "@OpenFarm/env/server";
import {
  DEFAULT_FARM_LOCALE,
  isCurrencyCode,
  isYearStart,
  setFarmLocale,
} from "@OpenFarm/i18n";

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
  const yearStarts = Number(
    env.OPENFARM_YEAR_STARTS ?? DEFAULT_FARM_LOCALE.yearStarts
  );
  if (!isYearStart(yearStarts)) {
    throw new Error(
      `OPENFARM_YEAR_STARTS is ${env.OPENFARM_YEAR_STARTS}, which is not a month from 1 to 12`
    );
  }
  setFarmLocale({
    currency,
    timeZone: env.OPENFARM_TIME_ZONE ?? DEFAULT_FARM_LOCALE.timeZone,
    country,
    yearStarts,
  });
};
