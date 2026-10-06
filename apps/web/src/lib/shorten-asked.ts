import { fieldOfMoment, momentOfField } from "@/lib/farm-moment";

/** Her two holds as they stand. */
interface Standing {
  milk: Date | null;
  meat: Date | null;
}

/** Which of her holds still holds her: a box for one already over would only end it again, or wipe its date. */
export const heldNow = (standing: Standing, now: Date) => ({
  milk: standing.milk !== null && standing.milk > now,
  meat: standing.meat !== null && standing.meat > now,
});

/** The boxes as the dialog opens them: each hold where it stands, on the farm's clock. */
export const openedAt = (standing: Standing) => ({
  milk: fieldOfMoment(standing.milk?.toISOString()),
  meat: fieldOfMoment(standing.meat?.toISOString()),
});

/**
 * What a shortening asks of the farm: only the holds whose boxes were changed — an emptied box ends that hold, a new
 * day and time shortens it to then. Every box was once sent, and a box left blank went as "end it now", so shortening
 * a cow's milk ended her meat hold and she could go on a lorry.
 */
export const shortenAsked = (
  standing: Standing,
  typed: { milk: string; meat: string },
  now: Date
): { milkUntil?: Date | null; meatUntil?: Date | null } => {
  const held = heldNow(standing, now);
  const opened = openedAt(standing);
  const changed = (kind: "milk" | "meat") =>
    held[kind] && typed[kind] !== opened[kind];
  const until = (kind: "milk" | "meat") =>
    typed[kind] === "" ? null : new Date(momentOfField(typed[kind]));
  return {
    ...(changed("milk") ? { milkUntil: until("milk") } : {}),
    ...(changed("meat") ? { meatUntil: until("meat") } : {}),
  };
};
