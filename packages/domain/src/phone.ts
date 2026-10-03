import type { Language } from "@OpenFarm/i18n";
import { farmCountry, latinDigitsOf, timeInDigits } from "@OpenFarm/i18n";
import type { CountryCode } from "libphonenumber-js/mobile";
import {
  getExampleNumber,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/mobile";
import examples from "libphonenumber-js/mobile/examples";

/**
 * A mobile number, the way the whole world writes it (E.164): `+`, the country code, then the number —
 * `+8801711234567`. One form, whatever was typed, so the screen asking for a number and the server reading it cannot
 * write the same phone two ways, and a text message goes to it through any gateway.
 */
export type MobileNumber = `+${string}`;

/** The country a number typed without its country code is read in: the farm's own (ADR 0013). */
const farmCountryCode = (): CountryCode | undefined => {
  const country = farmCountry();
  return isSupportedCountry(country) ? country : undefined;
};

/** Whether OpenFarm can read the mobile numbers of a country, so a farm is never set up in one it cannot. */
export const readsMobileNumbersOf = (country: string): boolean =>
  isSupportedCountry(country);

const parsed = (typed: string) =>
  parsePhoneNumberFromString(latinDigitsOf(typed), farmCountryCode());

/**
 * The mobile number somebody typed, however they typed it — with spaces or dashes, in Bangla digits, with the farm
 * country's code in front or without it (01711 234567, +880 1711-234567), or another country's after its `+`.
 * Null for anything that is not a mobile number: a landline, a number too short, a prefix no network uses.
 */
export const mobileNumberOf = (typed: string): MobileNumber | null => {
  const phone = parsed(typed);
  return phone?.isValid() ? (phone.number as MobileNumber) : null;
};

/**
 * A number as a person reads it: the way its own country writes it when it is the farm's (01711-234567), with its
 * country code when it is not (+971 50 123 4567), in the reader's digits. What is not a number is written as it was
 * typed.
 */
export const phoneSaid = (typed: string, language: Language): string => {
  const phone = parsed(typed);
  if (!phone?.isValid()) {
    return typed;
  }
  const written =
    phone.country === farmCountry()
      ? phone.formatNational()
      : phone.formatInternational();
  return timeInDigits(written, language);
};

/** A mobile number of the farm's country as an empty field shows it, so whoever types knows the shape asked for:
 *  01812-345678 in Bangladesh, in the reader's digits. */
export const phoneExample = (language: Language): string => {
  const country = farmCountryCode();
  const example = country ? getExampleNumber(country, examples) : undefined;
  return example ? timeInDigits(example.formatNational(), language) : "";
};
