import { atFarmTime, farmDayOf, farmTimeOf } from "@OpenFarm/domain";

/** An instant as a date-and-time box shows it: the farm's own day and minute, whatever clock the phone keeps. */
export const fieldOfMoment = (
  value: boolean | number | string | undefined
): string => {
  if (typeof value !== "string" || value === "") {
    return "";
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : `${farmDayOf(at)}T${farmTimeOf(at)}`;
};

/** What was typed in a date-and-time box, read as the farm's day and time, as the instant the farm keeps. */
export const momentOfField = (typed: string): string =>
  typed === ""
    ? ""
    : atFarmTime(
        typed.slice(0, "YYYY-MM-DD".length),
        typed.slice("YYYY-MM-DDT".length, "YYYY-MM-DDTHH:MM".length)
      ).toISOString();
