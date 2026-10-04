import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The phone downloads whatever the screens import. A screen that imports a value — not a type — from the server's
// packages brings the server's modules with it: once that was the whole database schema, sixty-seven kilobytes on a
// weak signal and every table laid out for anybody to read. Screens import types from them, and values only from
// modules that hold nothing else.

const SRC = path.join(import.meta.dirname, "..");

/** Modules of the server's packages with nothing behind them: safe for a screen to import. */
const IMPORT_FREE = new Set([
  "@OpenFarm/api/device-headers",
  "@OpenFarm/api/registers/rows",
  // How an error is written to the log, less what it was sent: it imports nothing.
  "@OpenFarm/api/thrown",
]);

/** Files that run on the server alone: the API's own routes, the server entry, and the isomorphic client whose
 *  server half the build strips from the phone's copy. */
const ON_THE_SERVER = [
  /^routes\/api\//u,
  /^server\.ts$/u,
  /^utils\/orpc\.ts$/u,
];

const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const at = path.join(dir, name);
    if (statSync(at).isDirectory()) {
      return sourcesUnder(at);
    }
    return /\.tsx?$/u.test(at) && !at.includes(".test.") ? [at] : [];
  });

/** Every `import { … } from "…"` that is not `import type`, with where it comes from. */
const VALUE_IMPORT =
  /^import (?!type\b)[^;]*?from "(?<from>@OpenFarm\/(?:api|db)[^"]*)";/gmu;

describe("what the phone downloads", () => {
  it("brings no server module with a screen", () => {
    const leaks = sourcesUnder(SRC).flatMap((file) => {
      const relative = path.relative(SRC, file);
      if (ON_THE_SERVER.some((pattern) => pattern.test(relative))) {
        return [];
      }
      return [...readFileSync(file, "utf-8").matchAll(VALUE_IMPORT)]
        .map((match) => match.groups?.from ?? "")
        .filter((from) => !IMPORT_FREE.has(from))
        .map((from) => `${relative}: ${from}`);
    });
    expect(leaks).toEqual([]);
  });
});
