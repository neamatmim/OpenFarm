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
