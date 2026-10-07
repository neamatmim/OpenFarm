import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Which of the farm's refusals nobody has given a word to.
 *
 * `sayWhy` never shows the server's English: a refusal with no word reads as the farm's plainest words — a figure
 * refused, a door not open, something went wrong — which is honest but tells the reader nothing to do. So every refusal
 * word the server throws has a word on the screens, and a throw with no refusal word at all is named below, each one
 * looked at. Add either kind without saying so and this fails.
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
  "ROW_REFUSED",
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

/** The codes a refusal with no word may have without being one a person is told about: signing in, a page gone, the
 *  farm's own failure, too many tries — each said by the screens by its code. */
const SAID_BY_CODE = new Set([
  "UNAUTHORIZED",
  "NOT_FOUND",
  "INTERNAL_SERVER_ERROR",
  "TOO_MANY_REQUESTS",
]);

/** Each `new ORPCError(…)` call in the server's source, whole: its parentheses counted, since an options object spans
 *  lines. */
const throwsIn = (source: string): string[] => {
  const calls: string[] = [];
  for (const found of source.matchAll(/new ORPCError\(/gu)) {
    let depth = 1;
    let at = (found.index ?? 0) + found[0].length;
    while (depth > 0 && at < source.length) {
      if (source[at] === "(") {
        depth += 1;
      } else if (source[at] === ")") {
        depth -= 1;
      }
      at += 1;
    }
    calls.push(source.slice(found.index, at));
  }
  return calls;
};

/** Every throw that carries no refusal word, as `file: what it says`, where its code is one a person is told about. */
const throwsUnworded = (): string[] => {
  const named: string[] = [];
  for (const file of walk(API).filter((one) => !one.includes(".test."))) {
    const where = path.relative(API, file);
    for (const call of throwsIn(readFileSync(file, "utf-8"))) {
      const code = /ORPCError\(\s*"(?<code>[A-Z_]+)"/u.exec(call)?.groups?.code;
      const worded = /refusal|reason:/u.test(call);
      if (code && !SAID_BY_CODE.has(code) && !worded) {
        const said = /message:\s*[`"](?<says>[^`"]{0,48})/u.exec(call)?.groups
          ?.says;
        // What it says, with whatever it fills in written as an ellipsis.
        const plain = said?.replaceAll(/\$\{[^}]*\}?/gu, "…");
        named.push(`${where}: ${plain ?? code}`);
      }
    }
  }
  return named.toSorted();
};

/**
 * The throws with no refusal word, as they stood on 2026-10-07, each looked at.
 *
 * - A bare FORBIDDEN is said "not open to your role" by its code.
 * - A Step's answer and a phone's Entry are refused by the evidence sheet's own checks before they are sent, or come
 *   back to the Outbox as late, wrong or not yours, which it words by that.
 * - The rest are doors no screen opens — a State set by hand, the farm made twice — and read "something went wrong".
 */
const UNWORDED_THROWS: string[] = [
  "audit.ts: A correction needs a reason",
  "breeding-store.ts: ",
  "completion-store.ts: Only a per-animal step or a dose can be skipped",
  "completion-store.ts: This step is recorded once",
  "completion-store.ts: This step is recorded per animal",
  "completion-store.ts: This step needs everything marked required",
  "completion-store.ts: This work is for …",
  "device.ts: Only a shed phone may do this",
  "effects/calving.ts: A calving has a calf; one without is an abortion",
  "effects/calving.ts: A calving is recorded about one cow, and this en",
  "effects/calving.ts: A calving says when she calved",
  "effects/calving.ts: Each calf needs its sex and whether it was born ",
  "effects/dls-report.ts: This work is not the report of any diagnosis",
  "effects/effect.ts: This step does not record where the milk went",
  "effects/evidence.ts: BAD_REQUEST",
  "effects/evidence.ts: That is not one of the things this step offers",
  "effects/evidence.ts: That is not one of the things this step offers",
  "effects/evidence.ts: This step records a figure, and none was given",
  "effects/service.ts: A service is recorded about one cow, and this wo",
  "effects/service.ts: A service says how she was served, and nothing w",
  "effects/service.ts: A service says when she was served",
  "effects/treatment.ts: This work is not a dose of any prescription",
  "entries/entry.ts: BAD_REQUEST",
  "entries/entry.ts: This is not this person's to record",
  "herd-store.ts: An animal in state … cannot move to",
  "herd-store.ts: An animal reaches … by a record of it — a",
  "herd-store.ts: Only an animal who has left the farm can come ba",
  "herd-store.ts: Only an animal written off as Lost can come back",
  "herd-store.ts: Only how an animal left the farm can be put righ",
  "late.ts: CONFLICT",
  "roles.ts: FORBIDDEN",
  "routers/breeding.ts: FORBIDDEN",
  "routers/cash.ts: FORBIDDEN",
  "routers/cash.ts: FORBIDDEN",
  "routers/farm.ts: The farm already exists",
  "routers/farm.ts: The farm already exists",
  "routers/milk.ts: FORBIDDEN",
  "routers/people.ts: FORBIDDEN",
  "routers/people.ts: Only a shed phone may read the roster",
  "routers/sops.ts: This cannot be published yet — …",
  "routers/stock.ts: FORBIDDEN",
  "routers/sync.ts: Recorded under nobody",
  "routers/sync.ts: Recorded under somebody who does not work on thi",
  "routers/sync.ts: Recorded under somebody who no longer works on t",
  "routers/sync.ts: Recorded under somebody who no longer works on t",
  "routers/sync.ts: That key belongs to another farm",
  "routers/sync.ts: That key has already been used for different ent",
  "routers/sync.ts: This was recorded by somebody else; it can only ",
  "scope.ts: FORBIDDEN",
];

describe("the farm's refusals", () => {
  it("all have a word on the screens", () => {
    const thrown = refusalsThrown();
    const worded = refusalsWorded();
    const unworded = [...thrown].filter((word) => !worded.has(word)).toSorted();
    expect(unworded).toEqual([]);
  });

  it("throw no refusal without a word unless it is named here", () => {
    // Named, not counted: a number going up tells nobody which one arrived.
    expect(throwsUnworded()).toEqual(UNWORDED_THROWS);
  });

  it("finds the words to check against at all", () => {
    // If a rename quietly emptied either side, the comparison above would pass by knowing nothing.
    expect(refusalsThrown().size).toBeGreaterThan(100);
    expect(refusalsWorded().size).toBeGreaterThan(100);
  });
});
