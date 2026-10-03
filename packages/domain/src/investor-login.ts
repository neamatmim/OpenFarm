import type { MobileNumber } from "./phone";
import { mobileNumberOf } from "./phone";

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

/** The address an Investor's portal account signs in as, from their phone: its mobile number as the world writes it,
 *  without the `+` an address cannot start with (8801711234567@…). Null for a number that is not a mobile one. */
export const investorLoginOf = (phone: string): string | null => {
  const number = mobileNumberOf(phone);
  return number ? `${number.slice(1)}@${INVESTOR_LOGIN_DOMAIN}` : null;
};

/** The phone an Investor's portal account signs in with, read back from its address: the other half of
 *  `investorLoginOf`, kept beside it. Null for an address that is not an Investor's. */
export const phoneOfInvestorLogin = (email: string): MobileNumber | null =>
  email.toLowerCase().endsWith(`@${INVESTOR_LOGIN_DOMAIN}`)
    ? `+${email.slice(0, email.indexOf("@"))}`
    : null;

/** Whether an address is an Investor's portal account rather than somebody's who works on the farm. */
export const isInvestorLogin = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${INVESTOR_LOGIN_DOMAIN}`);
