import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// A doc comment describes the declaration under it. Code slipped in between the two leaves the comment saying one
// thing above another — a second doc comment straight under the first is the mark of it, and reviews kept finding
// them by hand. Two together here are refused: one of them has lost what it describes.

const ROOT = path.join(import.meta.dirname, "../../..");
const SOURCES = ["packages", "apps/web/src"];

const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const at = path.join(dir, name);
    if (
      name === "node_modules" ||
      name === "migrations" ||
      name === "dist" ||
      name === ".output"
    ) {
      return [];
    }
    if (statSync(at).isDirectory()) {
      return sourcesUnder(at);
    }
    return /\.tsx?$/u.test(at) && !at.endsWith("routeTree.gen.ts") ? [at] : [];
  });

/** Where a doc comment ends with another starting on the very next line. */
const stackedIn = (file: string): number[] => {
  const lines = readFileSync(file, "utf-8").split("\n");
  const found: number[] = [];
  let inDoc = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith("/**")) {
      inDoc = true;
    }
    const closesADoc = inDoc && trimmed.endsWith("*/");
    if (closesADoc) {
      inDoc = false;
      if ((lines[index + 1] ?? "").trim().startsWith("/**")) {
        found.push(index + 2);
      }
    }
  }
  return found;
};

describe("doc comments", () => {
  it("each stand above what they describe, never on top of another", () => {
    const stacked = SOURCES.flatMap((source) =>
      sourcesUnder(path.join(ROOT, source)).flatMap((file) =>
        stackedIn(file).map((line) => `${path.relative(ROOT, file)}:${line}`)
      )
    );
    expect(stacked).toEqual([]);
  });
});
