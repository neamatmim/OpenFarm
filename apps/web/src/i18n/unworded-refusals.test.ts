import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Which of the farm's refusals nobody has given a word to.
 *
 * `sayWhy` falls back to whatever English the server threw, which is better than silence but is not the
 * farm's language. That fallback is deliberate and `saying.test.ts` says so — this guard only makes the
 * list of them a thing somebody chose rather than a number in a comment that rots. Add a refusal without
 * a word and this fails; put it in the list and you have said it was on purpose.
 *
 * It is the narrower question of the two: "no words map covers it", not "no screen can say it". A few
 * below are answered bespoke, by reading the refusal's own facts rather than its word — `meat_withdrawal`
 * is read for the day she is fit on, and says so in the reader's language. They stay listed because the
 * point is that somebody looked.
 */
const API = "../../packages/api/src";
const WEB = "src";

/** The maps a screen's words live in, whatever it calls them. */
const WORD_MAPS = [
  "WORDED_REFUSALS",
  "STANDING_ASIDE_WORDS",
  "WHY_NOT",
  "BLOCK_WORD",
  "CHARGE_WORD",
  "REFUSALS",
  "TROUBLE_WORD",
  "SAYS",
];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.tsx?$/u.test(name) && !name.endsWith(".gen.ts") ? [full] : [];
  });

const read = (dir: string, keep: (file: string) => boolean) =>
  walk(dir)
    .filter(keep)
    .map((file) => readFileSync(file, "utf-8"));

/**
 * Every refusal the farm can give, and every one a screen has a word for.
 *
 * Both read off the source rather than imported, because a refusal is a string in a `throw` and the
 * words are object keys: neither is reachable as a value from here.
 */
const refusalsThrown = (): Set<string> => {
  const words = new Set<string>();
  for (const source of read(API, (file) => !file.includes(".test."))) {
    for (const found of source.matchAll(/refusal: "(?<word>[a-z_]+)"/gu)) {
      const word = found.groups?.word;
      if (word) {
        words.add(word);
      }
    }
  }
  return words;
};

const refusalsWorded = (): Set<string> => {
  const words = new Set<string>();
  const maps = new RegExp(
    `(?:${WORD_MAPS.join("|")})\\s*(?::[^=]*)?=\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`,
    "gu"
  );
  for (const source of read(WEB, (file) => !file.includes(".test."))) {
    for (const found of source.matchAll(maps)) {
      for (const key of (found.groups?.body ?? "").matchAll(
        /^\s*"?(?<word>[a-z_]+)"?:/gmu
      )) {
        const word = key.groups?.word;
        if (word) {
          words.add(word);
        }
      }
    }
  }
  return words;
};

/**
 * The refusals nobody has worded, as they stood on 2026-09-19.
 *
 * Each is here because somebody looked at it, not because nobody noticed. Several are guards against a
 * door the screens do not open — `exit_needs_a_record` and `ready_needs_confirming` send a caller from
 * `animals.setState` to the record that belongs there, and no screen offers those states — and several
 * are the Vet's own, answered where they are raised.
 */
const UNWORDED = [
  "already_sold",
  "exit_needs_a_record",
  "meat_withdrawal",
  "no_such_product",
  "no_such_venture",
  "no_withdrawal_days",
  "not_fattening",
  "not_notifiable",
  "not_shorter",
  "owner_writes_their_own",
  "prescription_raises_it",
  "ready_needs_confirming",
  "served_in_the_future",
  "too_many_for_one_paper",
];

describe("the farm's refusals", () => {
  it("are all either worded or knowingly left in the server's English", () => {
    const thrown = refusalsThrown();
    const worded = refusalsWorded();
    const unworded = [...thrown].filter((word) => !worded.has(word)).toSorted();
    // Named, not counted: a number going up tells nobody which one arrived.
    expect(unworded).toEqual(UNWORDED);
  });

  it("finds the words to check against at all", () => {
    // If a rename quietly emptied either side, the comparison above would pass by knowing nothing.
    expect(refusalsThrown().size).toBeGreaterThan(100);
    expect(refusalsWorded().size).toBeGreaterThan(100);
  });
});
