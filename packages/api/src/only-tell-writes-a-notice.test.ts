import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// A notice is written by `tell` alone (notice.ts): who hears it, its facts typed per kind, the Owner when nobody else is
// left. Two writers once went round it, with facts nobody checked and audiences nobody read.

const SOURCE = path.join(import.meta.dirname);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return name.endsWith(".ts") && !name.includes(".test.") ? [full] : [];
  });

describe("a notice", () => {
  it("is written by tell alone", () => {
    const writers = walk(SOURCE)
      .filter((file) => readFileSync(file, "utf-8").includes("raiseAlerts("))
      .map((file) => path.relative(SOURCE, file))
      .toSorted();
    expect(writers).toEqual(["notice.ts"]);
  });
});
