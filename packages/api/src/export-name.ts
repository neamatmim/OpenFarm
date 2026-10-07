import { farmDayOf } from "@OpenFarm/domain";
import { farmTimeZone, latinDigitsOf } from "@OpenFarm/i18n";

/** Anything a file name should not carry: the slashes of a Registration number, spaces. */
const NOT_FOR_A_FILE_NAME = /[^A-Za-z0-9]+/gu;

/** Dashes run together where something between them was dropped. */
const DASHES = /-+/gu;

/** The farm's own hour and minute, as four digits: 0930. */
const hourAndMinuteOf = (at: Date): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: farmTimeZone(),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(at)
    .replace(":", "");

/**
 * What a CSV is saved as, stamped as an Export is (the Owner, 2026-10-07): the farm's Registration number, the farm's
 * own day and time it was made, what it is and the period it covers — so a file on the accountant's computer says whose
 * it is and when, while its rows stay clean for the spreadsheet. Who made it is in the Audit Event.
 */
export const stampedFileName = (
  farm: { registrationNumber: string | null },
  what: string,
  period: { from: string; to: string } | null,
  at: Date
): string => {
  const stamp = [
    "openfarm",
    // In English digits, as a file name travels: ০৪২ is 042.
    latinDigitsOf(farm.registrationNumber ?? "").replace(
      NOT_FOR_A_FILE_NAME,
      "-"
    ),
    farmDayOf(at),
    hourAndMinuteOf(at),
    what,
    ...(period ? [period.from, period.to] : []),
  ]
    .filter(Boolean)
    .join("-")
    .replace(DASHES, "-");
  return `${stamp}.csv`;
};
