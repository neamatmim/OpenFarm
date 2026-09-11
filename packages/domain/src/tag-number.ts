import type { Side } from "./lifecycle";

/** Tag Numbers are `D-0001…` for Dairy-born and `F-0001…` for Fattening intake. The prefix
 *  records where the Animal came from and never changes, even if it changes Side. */
export const TAG_PREFIXES = { dairy: "D", fattening: "F" } as const;
export type TagPrefix = (typeof TAG_PREFIXES)[keyof typeof TAG_PREFIXES];

const DIGITS = 4;
const TAG_PATTERN = /^(?<prefix>[DF])-(?<number>\d{4,})$/u;

export const prefixForOrigin = (origin: Side): TagPrefix =>
  TAG_PREFIXES[origin];

export const formatTagNumber = (prefix: TagPrefix, sequence: number): string =>
  `${prefix}-${String(sequence).padStart(DIGITS, "0")}`;

export const parseTagNumber = (
  tag: string
): { prefix: TagPrefix; sequence: number } | null => {
  const match = TAG_PATTERN.exec(tag.trim().toUpperCase());
  if (!match?.groups) {
    return null;
  }
  return {
    prefix: match.groups.prefix as TagPrefix,
    sequence: Number(match.groups.number),
  };
};

export const isTagNumber = (tag: string): boolean =>
  parseTagNumber(tag) !== null;
