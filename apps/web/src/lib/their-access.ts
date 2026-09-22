import type { RoleName } from "@OpenFarm/api/roles";

/**
 * Whether the viewer may reach into this person's way in — their PIN, a password code, where they are signed in.
 * The server's rule (`accessIsTheirsToGive`), asked here so a screen shows only what it will be allowed to do: the
 * Owner for anybody, a Manager only for Barn Staff.
 */
export const reachesTheirAccess = (
  viewerIsOwner: boolean,
  theirRoles: readonly RoleName[]
): boolean => viewerIsOwner || theirRoles.every((role) => role === "staff");
