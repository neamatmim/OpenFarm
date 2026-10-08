import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { en } from "@OpenFarm/i18n/messages/en";
import { describe, expect, it } from "vitest";

/**
 * The farm's English is in sentence case, its common nouns lowercase inside a sentence: "open a venture", "by her tag
 * number", "ask the owner". A thing the farm has many of, or a role without a name, is not a proper noun (Microsoft,
 * Google, Polaris and Atlassian alike; docs/research/english-typography.md §4). The glossary and the code keep their
 * capitals; the screens do not.
 *
 * Left as they are: what an Investor reads and the papers, whose wording the advisers approved and whose capitals mark
 * a contract's defined terms; a page or a tab named as where to go ("the Investors page"); and the parts of the product
 * there is one of (the Investor Portal, the Playbook).
 */
const ADVISERS_WORDING = new Set([
  "portal",
  "agreeInApp",
  "statements",
  "projection",
  "templates",
  "papers",
  "nominees",
]);

const COMMON_NOUNS = [
  "Settlement Adjustment",
  "Target Window",
  "Head Price",
  "Monthly Sum",
  "Cattle Budget",
  "Drug List",
  "Feed Item",
  "Wind-up Period",
  "Tag Number",
  "Shed Phone",
  "Barn Staff",
  "Settlement",
  "Registration",
  "Floor",
  "Quarantine",
  "Capital",
  "Reimbursement",
  "Amendment",
  "Adjustment",
  "Correction",
  "Diagnosis",
  "Campaign",
  "Arbitrator",
  "Nomination",
  "Nominee",
  "Intake",
  "Dispatch",
  "Sale",
  // Its plural is not "-s".
  "Categor(?:y|ies)",
  "Dairy",
  "Fattening",
  "Venture",
  "Investor",
  "Unit",
  "Agreement",
  "Farm",
  "Pen",
  "Vet",
  "Owner",
  "Manager",
  "Ration",
  "Season",
  "Version",
  "Lot",
  "Float",
  "Step",
  "Side",
];

/** Tabs a sentence sends somebody to, said as the tab says them. */
const TAB_NAMES = ["Capital in", "Money in and out"];

/** Inside a sentence: after any word (the sentence's first among them), a figure, a comma, a closing brace or
 *  bracket, a dash or a count's "#". */
const MID_SENTENCE = String.raw`(?:(?<=[A-Za-z0-9,;}\)%—–#’'] )|(?<=\())`;
const CAPITALIZED = new RegExp(
  `${MID_SENTENCE}(?:${COMMON_NOUNS.join("|")})(?:s|'s|s')?\\b(?! page| tab| Portal| Ops)`,
  "u"
);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.tsx?$/u.test(name) ? [full] : [];
  });

/** A page's name as its menu says it, which a sentence sending somebody there writes as it is: "on the Agreement
 *  templates page". One word is let through by the "page"/"tab" after it; a longer one is taken out whole. */
const PAGE_NAMES = [
  ...Object.entries(en)
    .filter(([key, words]) => key.startsWith("nav.") && words.includes(" "))
    .map(([, words]) => words),
  ...TAB_NAMES,
];

const withoutPageNames = (words: string) => {
  let left = words;
  for (const name of PAGE_NAMES) {
    left = left.replaceAll(name, "");
  }
  return left;
};

/** The words the portal's own screens read, which are the advisers' too. */
const portalKeys = new Set(
  ["src/components/portal", "src/routes/portal"]
    .flatMap(walk)
    .flatMap((file) => [
      ...readFileSync(file, "utf-8").matchAll(
        /["'`](?<key>[a-zA-Z]+\.[\w.]+)["'`]/gu
      ),
    ])
    .map((match) => match.groups?.key)
);

/** A label's own length: a menu item, a heading, a column, a button — not a sentence. */
const LABEL_LENGTH = 40;

/** Names a label keeps capitalized after its first word: proper names, an acronym, and the Return on capital the
 *  advisers approved by that name. */
const PROPER = new Set([
  "OpenFarm",
  "Eid",
  "Bangla",
  "English",
  "Bangladesh",
  "DLS",
  "SOP",
  "PIN",
  "Playbook",
  "Return",
]);

/** A word after a label's first that begins with a capital. */
const LATER_CAPITAL = /(?<=[A-Za-z0-9,;:'’)] )(?<word>[A-Z][a-z]+)/gu;

describe("the farm's English", () => {
  it("keeps common nouns lowercase inside a sentence", () => {
    const capitalized = Object.entries(en)
      .filter(
        ([key]) =>
          !ADVISERS_WORDING.has(key.split(".")[0] ?? "") && !portalKeys.has(key)
      )
      .filter(([, words]) => CAPITALIZED.test(withoutPageNames(words)))
      .map(([key, words]) => `${key}: ${words}`);

    expect(capitalized).toEqual([]);
  });

  it("writes its labels in sentence case", () => {
    const titleCased = Object.entries(en)
      .filter(
        ([key, words]) =>
          !ADVISERS_WORDING.has(key.split(".")[0] ?? "") &&
          !portalKeys.has(key) &&
          words.length <= LABEL_LENGTH
      )
      .filter(([, words]) =>
        [...words.matchAll(LATER_CAPITAL)].some(
          (found) => !PROPER.has(found.groups?.word ?? "")
        )
      )
      .map(([key, words]) => `${key}: ${words}`);

    expect(titleCased).toEqual([]);
  });
});
