/** When the farm suggests an Animal may be sold, and when it stops saying so. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Why the farm is suggesting an Animal be made Ready for Sale. */
export const READY_REASONS = ["weight", "window"] as const;
export type ReadyReason = (typeof READY_REASONS)[number];

/**
 * The grounds on which the farm would suggest this Animal, of which there are two and either
 * will do: her target weight reached, or her Target Window open.
 *
 * Both are reported when both hold, and neither is ranked above the other — the decision says
 * "target weight reached **or** Target Window open", and which of the two moves a Manager is
 * theirs to weigh, not the farm's to decide for them.
 *
 * A suggestion, never a decision: whether an animal is ready to sell is a judgement about the
 * animal standing in front of you, and the farm knows only two things about her.
 */
export const readyGrounds = (
  view: { latestKg: number | null; targetWeightKg: number | null },
  window: { opensAt: Date; closesAt: Date } | null,
  now: Date
): ReadyReason[] => {
  const grounds: ReadyReason[] = [];
  if (
    view.latestKg !== null &&
    view.targetWeightKg !== null &&
    view.latestKg >= view.targetWeightKg
  ) {
    grounds.push("weight");
  }
  // An open window stays a ground after it closes. A beast whose Eid has gone by is still
  // eating, and the farm has *more* reason to look at her, not less — the screen says the
  // window has passed rather than the farm going quiet about her.
  if (window && window.opensAt.getTime() <= now.getTime()) {
    grounds.push("window");
  }
  return grounds;
};

/** True once the last day of her Target Window is behind the farm. */
export const windowHasClosed = (
  window: { closesAt: Date } | null,
  now: Date
): boolean =>
  window !== null && window.closesAt.getTime() + DAY_MS <= now.getTime();

/**
 * Whether grounds the Manager has already set aside are still worth raising.
 *
 * Setting one aside is the Manager saying "I have looked at him and he is staying", so the farm
 * stops saying it — until it has something *new* to say. Something new means a ground that was
 * not there when they looked: no ranking of one ground above the other, and no farm policy about
 * which answer is final. The Manager's word stands until the facts change under it.
 *
 * A set-aside older than the animal's last State change has been overtaken by it: an animal
 * confirmed Ready and later put back to Fattening is one the Manager has changed their mind about
 * twice. Nothing is deleted to say so — the record of what was decided and why stays on the
 * animal, and simply stops being the last word.
 */
export const stillWorthSaying = (
  grounds: ReadyReason[],
  setAside: { grounds: ReadyReason[]; setAsideAt: Date } | null,
  stateChangedAt: Date
): boolean => {
  if (grounds.length === 0) {
    return false;
  }
  if (setAside === null || setAside.setAsideAt < stateChangedAt) {
    return true;
  }
  return grounds.some((ground) => !setAside.grounds.includes(ground));
};
