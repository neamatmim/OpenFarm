/** The Roles the roles matrix names. Mirrors the database enum; kept here so the domain
 *  package does not depend on the schema. */
export const ROLES = ["owner", "manager", "staff", "vet"] as const;
export type RoleName = (typeof ROLES)[number];
