import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Every visible string must go through t(): this guard fails the suite on JSX text
// written directly in Latin letters anywhere under routes/ or components/.
// Generated files and allow-listed brand/technical tokens are exempt.
const ROOTS = ["src/routes", "src/components"];
const ALLOWED = new Set(["OpenFarm", "API"]);
const JSX_TEXT = /(?<!=)>\s*(?<text>[^<>{};]*[A-Za-z][^<>{};]*?)\s*</gu;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.tsx?$/u.test(name) &&
      !name.endsWith(".gen.ts") &&
      !name.includes(".test.")
      ? [full]
      : [];
  });

describe("routes and components", () => {
  it("contain no untranslated JSX text", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const source = readFileSync(file, "utf-8");
        for (const match of source.matchAll(JSX_TEXT)) {
          const text = match.groups?.text?.trim() ?? "";
          if (text && !ALLOWED.has(text)) {
            offenders.push(`${path.relative(".", file)}: "${text}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
