import { readFileSync } from "node:fs";
import path from "node:path";

import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { blockerSaid, blockerStep, problemSaid } from "./sop-blockers";

// What stops a procedure being published, said where it is and what is wrong, in the reader's words — never the path
// a developer reads, on a Bangla page, and never "something here cannot be published" while the farm knows what.

const inBangla = (key: MessageKey, params?: MessageParams) =>
  translate("bn", key, params);

const DOMAIN = path.join(
  import.meta.dirname,
  "../../../../packages/domain/src"
);

/** The domain's own source, without its comments: they hold apostrophes and backticks that would pair with a
 *  literal's. */
const domainSource = (): string =>
  ["sop.ts", "step-shape.ts"]
    .map((file) => readFileSync(path.join(DOMAIN, file), "utf-8"))
    .join("\n")
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/^\s*\/\/.*$/gmu, "");

const AFTER_A_PATH =
  /^(?:\$\{\w+\}|steps(?:\[\$\{\w+\}\])?|triggers(?:\[\$\{\w+\}\])?|assignedRole|graceMinutes)[\w.[\]${}]*: (?<problem>.+)$/u;

/** The words after a path in a literal: "steps[0].effect: a Pen is fed once…". */
const afterAPath = (source: string): string[] =>
  [...source.matchAll(/`(?<template>[^`]*)`|"(?<plain>(?:[^"\\]|\\.)*)"/gu)]
    .map(
      (match) =>
        AFTER_A_PATH.exec(match.groups?.template ?? match.groups?.plain ?? "")
          ?.groups?.problem ?? ""
    )
    .filter((problem) => problem !== "" && !problem.startsWith("${"));

/** The words a rule or a shape keeps for itself. */
const keptByARule = (source: string): string[] =>
  [
    ...source.matchAll(
      /(?:problem|says|missingStep|missingTrigger):\s*\n?\s*(?:"(?<double>(?:[^"\\]|\\.)*)"|'(?<single>(?:[^'\\]|\\.)*)')/gu
    ),
  ].map((match) =>
    (match.groups?.double ?? match.groups?.single ?? "")
      .replaceAll(String.raw`\'`, "'")
      .replace(/^(?:steps|triggers): /u, "")
  );

/** The words the domain's tables hold, and those a once-only Step is told. */
const inTables = (source: string): string[] => [
  ...[
    "PER_ANIMAL_FIGURES",
    "ONCE_FOR_THE_PEN_FIGURES",
    "FARM_TIMED_EVENTS",
  ].flatMap((table) => {
    const start = source.indexOf(`const ${table}`);
    const body = source.slice(start, source.indexOf("};", start));
    return [...body.matchAll(/:\s*\n?\s*"(?<words>[^"]+)"/gu)].map(
      (match) => match.groups?.words ?? ""
    );
  }),
  ...[
    ...source.matchAll(
      /onceWithRequiredNoteProblems\([^)]*?"(?<once>[^"]+)"\s*\)/gu
    ),
  ].map((match) => match.groups?.once ?? ""),
];

/** Every problem the domain can find, read out of its own source, each with what it carries filled in. */
const everyProblem = (): string[] => {
  const source = domainSource();
  const found = new Set([
    ...afterAPath(source),
    ...keptByARule(source),
    ...inTables(source),
  ]);
  return [...found].map((problem) => problem.replaceAll(/\$\{[^}]+\}/gu, "1"));
};

describe("what stops a procedure being published", () => {
  it("says which box in which Step is missing its Bangla, in Bangla", () => {
    const said = blockerSaid(
      "steps[0].evidence[0].unit.bn: Bangla is required",
      inBangla
    );
    expect(said).toBe("ধাপ ১ — একক: বাংলায় লিখুন");
    expect(
      blockerStep("steps[0].evidence[0].unit.bn: Bangla is required")
    ).toBe(0);
  });

  it("has the farm's words for every problem the farm can find, and none of them is English", () => {
    const problems = everyProblem();
    expect(problems.length).toBeGreaterThan(60);
    const unworded = problems.filter(
      (problem) => problemSaid(problem, inBangla) === null
    );
    expect(unworded).toEqual([]);
    for (const problem of problems) {
      expect(problemSaid(problem, inBangla) ?? "").not.toMatch(/[A-Za-z]/u);
    }
  });

  it("says two problems in one Step as two different lines", () => {
    const one = blockerSaid(
      "steps[1].evidence: this step records a figure and asks for none",
      inBangla
    );
    const two = blockerSaid(
      "steps[1].effect: milk is recorded per animal",
      inBangla
    );
    expect(one).not.toBe(two);
  });

  it("quotes what was typed, and says a count of days in Bangla digits", () => {
    expect(
      blockerSaid('triggers[0].times: "25:00" is not a time of day', inBangla)
    ).toContain("“25:00”");
    expect(
      blockerSaid(
        "triggers[0].offsetDays: 365 days is as far ahead as work may be hung",
        inBangla
      )
    ).toContain("৩৬৫");
  });
});
