import { addDays } from "./fattening";
import { roundMoney } from "./money";

/**
 * A **Buyer Statement**: the milk buyer's own account of a stretch of days — his liters, what he pays for them — set
 * beside what the farm sent him, and the money that prices the milk whose price was to follow (ADR 0033). Pure, so the
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

/** A Dispatch as what its milk came to is read from it: the record's own figures, as text or as numbers. */
export interface MilkSent {
  liters: string | number;
  pricePerLiterMoney: string | number | null;
  receivableMoney: number;
  buyerStatementId: string | null;
}

/**
 * What a Dispatch's milk came to as it stands: its liters at its price, to the paisa; for milk whose price was to
 * follow, what its Buyer Statement priced it at — all of it owed, as nothing was paid at the gate — and nothing while
 * its price is still to follow. The farm and the screen both read it here, so neither counts milk nobody has priced.
 */
export const worthOfMilkSent = (row: MilkSent): number | null => {
  if (row.pricePerLiterMoney !== null) {
    return roundMoney(Number(row.liters) * Number(row.pricePerLiterMoney));
  }
  return row.buyerStatementId === null ? null : row.receivableMoney;
};

/** A day's or a month's milk money, and apart from it the liters whose price is still to follow: never counted at
 *  nothing. */
export const milkMoneyOf = (
  rows: readonly { liters: number; worthMoney: number | null }[]
): { amount: number; litersToFollow: number } => {
  let amount = 0;
  let litersToFollow = 0;
  for (const row of rows) {
    if (row.worthMoney === null) {
      litersToFollow += row.liters;
    } else {
      amount += row.worthMoney;
    }
  }
  return {
    amount: roundMoney(amount),
    litersToFollow: Math.round(litersToFollow * 100) / 100,
  };
};

/** The days past his period a buyer's statement is waited for before his milk is called late: the post, a holiday. */
export const PRICE_TO_FOLLOW_GRACE_DAYS = 10;

/** A buyer's last standing statement's days, as his periods are stepped from. */
export interface StatementDays {
  fromDay: string;
  toDay: string;
}

/** The last day of the calendar month a farm day falls in. */
const lastOfMonth = (day: string): string => {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, month ?? 1, 0))
    .toISOString()
    .slice(0, "YYYY-MM-DD".length);
};

/**
 * The last day of the buyer's statement period a farm day falls in: periods as long as his last standing statement's,
 * stepping on from its last day, and back from it for milk older than it; the calendar month while he has sent none —
 * most centers pay monthly or twice a month.
 */
export const statementPeriodEndOf = (
  day: string,
  last: StatementDays | null
): string => {
  if (last === null) {
    return lastOfMonth(day);
  }
  const period = statementPeriodDays(last.fromDay, last.toDay);
  const offset = statementPeriodDays(last.toDay, day) - 1;
  const periods =
    offset > 0 ? Math.ceil(offset / period) : -Math.floor(-offset / period);
  return addDays(last.toDay, periods * period);
};

/**
 * The first farm day milk sent with its price to follow is late: ten days after the end of the buyer's period it
 * falls in (`statementPeriodEndOf`), when his statement for it could have come — the same day for milk sent on the
 * first day of the period and on its last.
 */
export const priceToFollowLateFrom = (
  leftOn: string,
  last: StatementDays | null
): string =>
  addDays(statementPeriodEndOf(leftOn, last), PRICE_TO_FOLLOW_GRACE_DAYS + 1);

/** Whether milk sent with its price to follow is late on this farm day. */
export const isPriceToFollowLate = (
  leftOn: string,
  today: string,
  last: StatementDays | null
): boolean => today >= priceToFollowLateFrom(leftOn, last);
