import { MAX_COURSE_DAYS } from "@OpenFarm/domain";
import { latinDigitsOf } from "@OpenFarm/i18n";

const TIME = /^(?<hour>\d{1,2}):(?<minute>\d{2})$/u;
const WHOLE = /^\d+$/u;
const LAST_HOUR = 23;
const LAST_MINUTE = 59;

/** One time as typed, as the farm writes it — "8:00" or "০৮:০০" is "08:00" — or nothing where it is not a time. Read
 *  so wherever the farm asks a time of day: a course's, a procedure's, the digest's. */
export const timeOf = (typed: string): string | null => {
  const said = TIME.exec(latinDigitsOf(typed.trim()))?.groups;
  if (!said?.hour || !said.minute) {
    return null;
  }
  const hour = Number(said.hour);
  const minute = Number(said.minute);
  return hour <= LAST_HOUR && minute <= LAST_MINUTE
    ? `${String(hour).padStart(2, "0")}:${said.minute}`
    : null;
};

/**
 * The times of a course as the Vet types them — separated by commas, in Bangla digits or not — or nothing where any
 * is not a time. Sent as typed, "০৮:০০" and "8:00" were refused by the farm in English.
 */
export const courseTimesOf = (typed: string): string[] | null => {
  const parts = typed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const times = parts.map(timeOf);
  return times.every((one) => one !== null) ? times : null;
};

/** The days of a course as typed: a whole number of them the farm takes, or nothing — a blank box went as nought. */
export const courseDaysOf = (typed: string): number | null => {
  const latin = latinDigitsOf(typed.trim());
  if (!WHOLE.test(latin)) {
    return null;
  }
  const days = Number(latin);
  return days >= 1 && days <= MAX_COURSE_DAYS ? days : null;
};
