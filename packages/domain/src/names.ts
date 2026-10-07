/** Any run of spaces, as one. */
const SPACES = /\s+/gu;

/** A name as two spellings of it are compared: in one Unicode form — ড় or য় typed as one letter or as the letter and its
 *  nukta, as two Bangla keyboards do, is one name — with its spaces as one, trimmed, whatever the capitals. Kept here
 *  so the farm's refusal and a screen's "already have it" ask the same question. */
export const nameAsCompared = (name: string): string =>
  name.normalize("NFC").replace(SPACES, " ").trim().toLowerCase();

/** Whether two names are one name, as the farm compares them. */
export const sameName = (one: string, other: string): boolean =>
  nameAsCompared(one) === nameAsCompared(other);
