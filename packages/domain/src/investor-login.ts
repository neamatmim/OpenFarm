/**
 * How an Investor's phone number is written as the address their portal account signs in as (ADR 0007).
 *
 * The farm's accounts are addressed by email, and an Investor is known by their phone: the phone is what they type,
 * and this is the one place it is turned into the address — the screen asking for it and the server opening the
 * account both ask here, so the two cannot write the same number two ways. `.invalid` is the domain no mail is ever
 * delivered to (RFC 2606), so nothing is ever sent to it and it can never be somebody's real address.
 */
export const INVESTOR_LOGIN_DOMAIN = "investor.openfarm.invalid";

/** How many hours one sign-in to the portal lasts, whatever it does meanwhile: a working day. An Investor's figures are
 *  money, and a phone left signed in for a week is somebody else reading them. The farm's own people keep a week. */
export const PORTAL_SIGN_IN_HOURS = 12;

/** A Bangladeshi mobile number: 01, then nine digits. */
const MOBILE = /^01\d{9}$/u;

/**
 * The number as the farm writes it — 01, then nine digits — from however it was typed: with +88 or 88 in front,
 * with spaces or dashes, in Bangla digits. Null for anything that is not a Bangladeshi mobile number.
 */
export const mobileNumberOf = (typed: string): string | null => {
  const digits = typed
    .replaceAll(/[০-৯]/gu, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .replaceAll(/\D/gu, "");
  const local = digits.startsWith("880") ? digits.slice(2) : digits;
  return MOBILE.test(local) ? local : null;
};

/** The address an Investor's portal account signs in as, from their phone; null for a number that is not one. */
export const investorLoginOf = (phone: string): string | null => {
  const number = mobileNumberOf(phone);
  return number ? `${number}@${INVESTOR_LOGIN_DOMAIN}` : null;
};

/** Whether an address is an Investor's portal account rather than somebody's who works on the farm. */
export const isInvestorLogin = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${INVESTOR_LOGIN_DOMAIN}`);
