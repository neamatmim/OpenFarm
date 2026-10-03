import { isFinished } from "./work";

/**
 * Who holds a piece of work from this person, or nobody: whoever claimed it, or it is pinned to, where that is somebody
 * else. Once it is finished nobody holds it from those who run the farm — the Owner and the Manager put a finished
 * Step right by a Correction, whoever did it.
 */
export const heldFromThem = <Holder extends { id: string }>(
  heldBy: Holder | null,
  them: { id: string; roles: readonly string[] },
  state: string
): Holder | null => {
  if (!heldBy || heldBy.id === them.id) {
    return null;
  }
  const runsTheFarm = them.roles.some(
    (role) => role === "owner" || role === "manager"
  );
  return isFinished(state) && runsTheFarm ? null : heldBy;
};
