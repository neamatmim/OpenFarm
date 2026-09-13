import { farmDaysBetween } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { farmDay } from "./farm-clock";

/** The longest stretch one report or list covers. A year is what a processor, an inspector or an
 *  accountant asks for. */
const LONGEST_PERIOD_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A period of farm days, as an input carries it. */
export const periodInput = { from: farmDay, to: farmDay };

/** The farm days a period covers, refused when it runs backwards or is longer than a year. */
export const periodOf = (period: { from: string; to: string }) => {
  if (period.to < period.from) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A period ends after it begins",
      data: { refusal: "period_backwards" },
    });
  }
  const range = farmDaysBetween(period.from, period.to);
  if (
    range.until.getTime() - range.from.getTime() >
    LONGEST_PERIOD_DAYS * DAY_MS
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "One report covers a year at most",
      data: { refusal: "period_too_long" },
    });
  }
  return range;
};
