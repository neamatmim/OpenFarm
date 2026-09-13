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
 *
 * `renewalLeadDays` is the Farm Parameter, not a rule hidden here: how early a farm wants to be
 * told is the Manager's to set.
 */
export const identityView = (
  farm: FarmIdentity,
  now: Date,
  renewalLeadDays: number
) => {
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
      goodUntil - now.getTime() <= renewalLeadDays * DAY_MS,
  };
};

/**
 * When the Registration's renewal falls due: the renewal lead before the certificate runs out — the same
 * moment the farm starts saying the registration is ending soon, so the work and the warning agree.
 */
export const renewalDueAt = (expiresOn: Date, renewalLeadDays: number): Date =>
  new Date(expiresOn.getTime() + DAY_MS - renewalLeadDays * DAY_MS);

/**
 * The farm of origin as every document leaving the farm heads itself: name, address, phone and
 * Registration number, leaving out whatever the farm has not written down.
 *
 * One place, because the DLS letter, the sale receipt and the transport card all begin with the
 * same four lines and three copies of them is three chances to disagree about the farm.
 */
export const farmOfOriginLines = (farm: FarmIdentity): string[] =>
  [
    `খামার: ${farm.name}`,
    farm.address?.trim() ? `ঠিকানা: ${farm.address}` : null,
    farm.phone?.trim() ? `মোবাইল: ${farm.phone}` : null,
    farm.registrationNumber?.trim()
      ? `নিবন্ধন নম্বর: ${farm.registrationNumber}`
      : null,
  ].filter((line) => line !== null);
