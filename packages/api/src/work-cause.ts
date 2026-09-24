import type { CalvingLead } from "@OpenFarm/domain";
import { SERVICE } from "@OpenFarm/domain";

/**
 * What raised a piece of work, written on it as a string and read back off it.
 *
 * An SOP Instance carries a `cause`: the happening that raised it and how long after it was due. The
 * format is nobody's business but this file's — four places had begun to agree on it by convention,
 * and a fifth reading it slightly differently is how work comes loose from the thing that raised it.
 * Every key is built here and every key is parsed here.
 *
 * Not the glossary's word for anything: a **Trigger** is what the Playbook hangs work on, and this is
 * the note the farm writes to itself about which particular happening did it.
 */

/**
 * The cause a happening writes on the work it raises: `<happening key>:+<days later>`.
 *
 * Built here and read back here, because four places had begun to agree on this string by
 * convention — the slot builder, the effect that finds which Heat a Service answered, her page
 * linking a Heat to its work, and the correction that takes a Heat's work back.
 */
export const causeOf = (happeningKey: string, offsetDays: number): string =>
  `${happeningKey}:+${offsetDays}`;

/** The key a Heat's sighting writes, and the cause the work it raises therefore carries. */
export const heatKeyOf = (observationId: string): string =>
  `heat:${observationId}`;

const HEAT_CAUSE = /^heat:(?<id>[^:]+):\+\d+$/u;

/** Which Heat's sighting raised a piece of work, or null when a Heat did not raise it. */
export const heatThatRaised = (cause: string | null): string | null =>
  (cause ? HEAT_CAUSE.exec(cause)?.groups?.id : undefined) ?? null;

/**
 * The key an attempt writes: its first service, and the instant she was served. The instant is
 * part of it, as it is of a State reached, because a Correction to the day she was served moves the
 * Pregnancy Check — the work raised on the old day is closed and the new day raises its own.
 */
export const attemptKeyOf = (served: { id: string; servedAt: Date }): string =>
  `${SERVICE}:${served.id}:${served.servedAt.toISOString()}`;

/** Every attempt's key begins so: how the work an attempt raised is found among a cow's work. */
export const ATTEMPT_KEY_PREFIX = `${SERVICE}:`;

/**
 * The key an expected calving writes: the cow, and the Lactation her calving will end. Not the date,
 * and not where the date came from — a date that moves, or comes to be worked out from a different
 * service, is still the same calving, and takes its work with it rather than raising a second lot
 * beside work already done.
 */
export const calvingKeyOf = (her: {
  id: string;
  lactationNumber: number;
}): string => `calving:${her.id}:${her.lactationNumber}`;

/** The cause calving work carries: its pregnancy's key, and which lead it keeps. */
export const calvingCauseOf = (key: string, lead: CalvingLead): string =>
  `${key}:${lead}`;

/** Every piece of calving work about one cow has a cause beginning so. */
export const calvingWorkPrefix = (animalId: string): string =>
  `calving:${animalId}:`;

const CALVING_CAUSE =
  /^(?<key>calving:[^:]+:\d+):(?<lead>dry_off|calving_prep)$/u;

/** A calving cause read back: its pregnancy's key and its lead, or null for any other cause. */
export const calvingCauseParts = (
  cause: string | null
): { key: string; lead: CalvingLead } | null => {
  const groups = cause ? CALVING_CAUSE.exec(cause)?.groups : undefined;
  return groups?.key && groups.lead
    ? { key: groups.key, lead: groups.lead as CalvingLead }
    : null;
};

/**
 * The cause scheduled work about the whole farm carries: the time it is due. Work in no Pen has no Pen to keep it
 * one a day, so this does — the same time is the same piece of work, however often the day is turned.
 */
export const wholeFarmCauseOf = (dueAt: Date): string =>
  `whole-farm:${dueAt.toISOString()}`;
