/**
 * The shortest password the farm accepts, said once for everybody who has to know it: better-auth, which refuses a
 * shorter one, and the three screens that say so before the farm has to.
 *
 * Eight, because these are chosen in a shed and typed on a phone with wet hands, and a length nobody can keep is
 * kept on a wall instead. What guards the farm is not length: sign-in, sign-up and password reset are rate limited,
 * and a password reset turns out whoever is still signed in as that person.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * What the door answers a password everybody uses with, as a code a screen can recognise. Here beside the length rule,
 * not beside the list, because the web imports this module and should never carry the list.
 */
export const PASSWORD_TOO_COMMON = "PASSWORD_TOO_COMMON";
