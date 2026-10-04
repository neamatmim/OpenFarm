/** The Roles the roles matrix names. Mirrors the database enum; kept here so the domain
 *  package does not depend on the schema. */
export const ROLES = ["owner", "manager", "staff", "vet"] as const;
export type RoleName = (typeof ROLES)[number];

/** What a Manager may invite: Barn Staff, or a Vet called in for a visit — never a second Owner, a Manager, or a
 *  Vet who stays (roles matrix). One rule for writing an invitation and for handing out a new code for one, since
 *  either way the code is what takes the Roles up. */
export const aManagerMayInvite = (
  roles: readonly RoleName[],
  visiting: boolean
): boolean => roles.every((role) => role === "staff") || visiting;
