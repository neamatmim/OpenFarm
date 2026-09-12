/** How long before a registration runs out the farm starts saying so. The renewal SOP is due
 *  ninety days ahead (the registration decision), so a farm that has not been told by then is a
 *  farm finding out from an inspector. */
export const REGISTRATION_NOTICE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the farm is, as every document it sends out needs it. */
export interface FarmIdentity {
  name: string;
  address: string | null;
  phone: string | null;
  registrationNumber: string | null;
  registrationOffice: string | null;
  registrationIssuedOn: Date | null;
  registrationExpiresOn: Date | null;
}

/**
 * The farm's identity as a screen reads it, with the two things about a registration anybody
 * actually asks: has it run out, and is it about to.
 *
 * Derived rather than stored, because "expired" is a fact about today and not about the farm — a
 * flag written last March would be wrong by April.
 */
export const identityView = (farm: FarmIdentity, now: Date) => {
  const expiresOn = farm.registrationExpiresOn;
  // A certificate that says it expires on the 31st is good all of the 31st, so the registration
  // has run out only once that whole day is behind the farm. `registrationExpiresOn` is the
  // start of that day, which is how the farm's own clock writes a date down.
  const goodUntil = expiresOn === null ? null : expiresOn.getTime() + DAY_MS;
  const expired = goodUntil !== null && goodUntil <= now.getTime();
  return {
    ...farm,
    /** Nothing written down at all: the transport card cannot be printed complete. */
    registrationMissing: !farm.registrationNumber,
    registrationExpired: expired,
    registrationEndingSoon:
      !expired &&
      goodUntil !== null &&
      goodUntil - now.getTime() <= REGISTRATION_NOTICE_DAYS * DAY_MS,
  };
};
