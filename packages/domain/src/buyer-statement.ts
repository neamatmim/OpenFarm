import { addDays } from "./fattening";

/**
 * A **Buyer Statement**: the milk buyer's own account of a stretch of days — his liters, what he pays for them — set
 * beside what the farm sent him, and the money that prices the milk whose price was to follow (ADR 0030). Pure, so the
 * screen's preview and the farm's settling say the same.
 */

/** A paisa is the smallest money there is: every figure here is worked in whole paisa and handed back in taka. */
const PAISA = 100;

/** A liter is measured to the hundredth: liters are weighed in whole hundredths. */
const HUNDREDTHS = 100;

/**
 * A statement's money spread over the Dispatches it prices, each by its liters' share, in whole paisa that add up to
 * the whole. The paisa the shares leave over go one each to the Dispatches whose share lost most to the rounding, and
 * between equals to the one given first — the caller gives them oldest first — so the same statement always prices the
 * same milk the same way. Worked in whole numbers past the float's reach: a lakh of taka over a tanker's liters is more
 * than a float multiplies exactly.
 */
export const spreadByLiters = (
  amountMoney: number,
  dispatches: readonly { id: string; liters: number }[]
): Map<string, number> => {
  const total = BigInt(Math.round(amountMoney * PAISA));
  const weights = dispatches.map((one) =>
    BigInt(Math.round(one.liters * HUNDREDTHS))
  );
  const whole = weights.reduce((sum, one) => sum + one, 0n);
  if (dispatches.length === 0 || whole === 0n) {
    return new Map();
  }
  const shares = weights.map((weight, at) => ({
    at,
    paisa: (total * weight) / whole,
    leftOver: (total * weight) % whole,
  }));
  let remainder = total - shares.reduce((sum, one) => sum + one.paisa, 0n);
  const byLoss = shares.toSorted((a, b) => {
    if (a.leftOver === b.leftOver) {
      return a.at - b.at;
    }
    return a.leftOver > b.leftOver ? -1 : 1;
  });
  for (const share of byLoss) {
    if (remainder <= 0n) {
      break;
    }
    share.paisa += 1n;
    remainder -= 1n;
  }
  return new Map(
    shares.map((share) => [
      dispatches[share.at]?.id ?? "",
      Number(share.paisa) / PAISA,
    ])
  );
};

/**
 * The buyer's liters beside the farm's for the same days: how many more he counted — fewer, where it is less than
 * nothing, which is short measure — and what part of the farm's liters that is, to two places. No part where the farm
 * sent him nothing in the period.
 */
export const litersCompared = ({
  statedLiters,
  farmLiters,
}: {
  statedLiters: number;
  farmLiters: number;
}): { differenceLiters: number; differencePercent: number | null } => {
  const difference =
    Math.round((statedLiters - farmLiters) * HUNDREDTHS) / HUNDREDTHS;
  return {
    differenceLiters: difference,
    differencePercent:
      farmLiters > 0
        ? Math.round((difference / farmLiters) * 100 * 100) / 100
        : null,
  };
};

/** The days a statement covers, its first and its last both counted. */
export const statementPeriodDays = (fromDay: string, toDay: string): number =>
  Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000)
  ) + 1;

/** A buyer who has sent no statement yet is allowed a month for one: most centres pay monthly or twice a month. */
export const PRICE_TO_FOLLOW_DEFAULT_PERIOD_DAYS = 31;

/** The days past his period a buyer's statement is waited for before his milk is called late: the post, a holiday. */
export const PRICE_TO_FOLLOW_GRACE_DAYS = 10;

/**
 * The first farm day milk sent with its price to follow is late: the buyer's own period — as long as his last
 * statement's, or a month while he has sent none — and ten days more after the day it left, so milk sent on the first
 * day of his period and on the last are both waited for until his statement could have come.
 */
export const priceToFollowOverdueFrom = (
  leftOn: string,
  periodDays: number | null
): string =>
  addDays(
    leftOn,
    (periodDays ?? PRICE_TO_FOLLOW_DEFAULT_PERIOD_DAYS) +
      PRICE_TO_FOLLOW_GRACE_DAYS
  );

/** Whether milk sent with its price to follow is late on this farm day. */
export const isPriceToFollowOverdue = (
  leftOn: string,
  today: string,
  periodDays: number | null
): boolean => today >= priceToFollowOverdueFrom(leftOn, periodDays);
