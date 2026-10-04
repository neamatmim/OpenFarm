/**
 * The address a Barn Staff member who works only on the farm's Shed Phones is kept under (ADR 0003). Every person is an
 * account with an address, and one with no email of their own is given this: nothing is ever sent to it, nobody signs
 * up with it, and it has no password, so it never signs in — it holds their Membership and their PIN, and nothing
 * more. `.invalid` is the domain no mail is ever delivered to (RFC 2606), as an Investor's portal address is.
 */
export const SHED_PHONE_ONLY_DOMAIN = "shed-phone.openfarm.invalid";

/** The address kept for one such person, by their id. */
export const shedPhoneOnlyAddressOf = (userId: string): string =>
  `${userId}@${SHED_PHONE_ONLY_DOMAIN}`;

/** Whether an address is one kept for somebody who works only on the Shed Phones. */
export const worksOnlyOnShedPhones = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${SHED_PHONE_ONLY_DOMAIN}`);
