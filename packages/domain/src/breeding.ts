/**
 * The word an Observation uses for oestrus. An Observation that says this is a **Heat**.
 *
 * A fixed word rather than a meaning somebody attaches to a choice, because the Version's choices
 * are the author's to reword and reorder, and the farm has to be able to tell a Heat from "off her
 * feed" in a record written three seasons ago. The Observation's `saw` was built to be this stable
 * word (increment 2), so Breeding reads it rather than inventing a second one.
 */
export const HEAT = "heat";

const HOUR_MS = 60 * 60 * 1000;

/**
 * When the AI work a Heat raises falls due, and how long it has before it is late.
 *
 * A service takes in a window after the heat is seen, not at an instant — so the work is due at
 * the window's start and late at its end. Both ends are Farm Parameters: how soon a technician can
 * reach the farm is a fact about this farm, not about cattle.
 */
export const aiWindow = (
  seenAt: Date,
  window: { startHours: number; endHours: number }
): { dueAt: Date; graceMinutes: number } => ({
  dueAt: new Date(seenAt.getTime() + window.startHours * HOUR_MS),
  graceMinutes: (window.endHours - window.startHours) * 60,
});

/**
 * Two sightings closer than this are the same heat.
 *
 * A standing heat lasts most of a day and its signs longer, so a cow marked on the evening round
 * and again the next morning has been seen once, twice. A cow returns to heat about three weeks
 * later, which is far outside it. Not a Farm Parameter: this is a fact about cattle, not about
 * this farm.
 */
export const SAME_HEAT_WITHIN_HOURS = 48;

/**
 * Which sightings begin a heat, and so which raise work.
 *
 * Decided from the sightings themselves and not from whatever work happens to be open, because
 * the open work is the wrong thing to ask. A cow served on the morning of her heat and seen again
 * that evening has no open job — and the evening sighting must still raise nothing. Two sightings
 * that reach the farm together from a phone that had no signal must raise one job, not two. Only
 * the sightings can say that, and they say it the same way however late they arrive.
 */
export const heatsThatBegin = <
  Sighting extends {
    id: string;
    animalId: string;
    seenAt: Date;
  },
>(
  sightings: Sighting[]
): Sighting[] => {
  const ordered = sightings.toSorted(
    (a, b) =>
      a.animalId.localeCompare(b.animalId) ||
      a.seenAt.getTime() - b.seenAt.getTime() ||
      a.id.localeCompare(b.id)
  );
  const begun: Sighting[] = [];
  // Measured from the sighting that began her heat, not from the last one: a cow marked every
  // day for a week is not one long heat, and chaining would let a run of sightings hide the fact.
  let began: Sighting | undefined;
  for (const sighting of ordered) {
    const sameHeat =
      began !== undefined &&
      began.animalId === sighting.animalId &&
      sighting.seenAt.getTime() - began.seenAt.getTime() <
        SAME_HEAT_WITHIN_HOURS * HOUR_MS;
    if (!sameHeat) {
      begun.push(sighting);
      began = sighting;
    }
  }
  return begun;
};
