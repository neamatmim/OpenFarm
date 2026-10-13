import { latinDigitsOf } from "@OpenFarm/i18n";

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

/** The Bangla a Tag Number's prefix is spoken and typed as, beside the letter it is written with. */
const BANGLA_PREFIXES: readonly (readonly [string, TagPrefix])[] = [
  ["ডি", "D"],
  ["এফ", "F"],
];

/** A prefix and a number, however they were joined: D-12, D12, D 12. */
const TYPED_TAG = /^(?<prefix>[DF])[\s-]*(?<number>\d+)$/u;

/**
 * A Tag Number as somebody typed it, read as the farm writes it: English digits for a Bangla keyboard's, D or F for
 * the ডি or এফ it types, capitals, and the number padded as the farm pads it — ডি-১২, D12 and d-12 are all D-0012.
 * What is not a prefix and a number is handed back in capitals and English digits and nothing more, for a search to
 * narrow by: "১২" is "12", never a guess at which Side's twelve.
 */
export const tagNumberAsWritten = (typed: string): string => {
  let read = latinDigitsOf(typed.trim());
  for (const [bangla, letter] of BANGLA_PREFIXES) {
    if (read.startsWith(bangla)) {
      read = letter + read.slice(bangla.length);
    }
  }
  read = read.toUpperCase();
  const tag = TYPED_TAG.exec(read)?.groups;
  return tag
    ? formatTagNumber(tag.prefix as TagPrefix, Number(tag.number))
    : read;
};
