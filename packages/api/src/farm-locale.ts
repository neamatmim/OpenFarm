import { env } from "@OpenFarm/env/server";
import {
  DEFAULT_FARM_LOCALE,
  isCurrencyCode,
  setFarmLocale,
} from "@OpenFarm/i18n";

/**
 * Where the farm is, as its server was set up to say (ADR 0013): read once, before anything is written out or a farm
 * day worked out, by every way into the server — a request, the schedule, the seed. A currency or a zone the farm
 * cannot count in stops the server there, rather than reading every sum and every day wrongly.
 */
export const settleFarmLocale = (): void => {
  const currency = env.OPENFARM_CURRENCY ?? DEFAULT_FARM_LOCALE.currency;
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `OPENFARM_CURRENCY is ${currency}, which OpenFarm does not count money in`
    );
  }
  setFarmLocale({
    currency,
    timeZone: env.OPENFARM_TIME_ZONE ?? DEFAULT_FARM_LOCALE.timeZone,
  });
};
