import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Which of the farm's messages nothing says.
 *
 * A message nobody reads still has to be translated, kept in step with its English, and read past by whoever looks
 * for the words a screen uses — and it is how a screen that was taken away leaves its sentences behind. A message is
 * said when its key is written out somewhere in the app or the packages, or when a key is built from a prefix that
 * is (`role.${role}`): the part before the braces says which family it belongs to, and the compiler checks the rest.
 */
const ROOTS = ["src", "../../packages"];
const MESSAGES = path.join("..", "..", "packages", "i18n", "src", "messages");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === "dist") {
      return [];
    }
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.tsx?$/u.test(name) ? [full] : [];
  });

/** Every source the app is made of: not its tests, not the messages themselves, not the generated route tree. */
const sources = (): string[] =>
  ROOTS.flatMap((root) => walk(root))
    .filter(
      (file) =>
        !file.includes(".test.") &&
        !file.startsWith(MESSAGES) &&
        !file.endsWith(".gen.ts")
    )
    .map((file) => readFileSync(file, "utf-8"));

const KEY = /^ {2}"(?<key>[^"]+)":/gmu;
const WRITTEN = /["'`](?<key>[a-zA-Z]\w*(?:\.\w+)+)["'`]/gu;
const BUILT = /`(?<prefix>[a-zA-Z][\w.]*\.)\$\{/gu;

const keysOf = (file: string): string[] =>
  [...readFileSync(path.join(MESSAGES, file), "utf-8").matchAll(KEY)].map(
    (found) => found.groups?.key ?? ""
  );

describe("the farm's messages", () => {
  it("are each said somewhere", () => {
    const written = new Set<string>();
    const prefixes = new Set<string>();
    for (const source of sources()) {
      for (const found of source.matchAll(WRITTEN)) {
        written.add(found.groups?.key ?? "");
      }
      for (const found of source.matchAll(BUILT)) {
        prefixes.add(found.groups?.prefix ?? "");
      }
    }
    const unsaid = keysOf("en.ts").filter(
      (key) =>
        !written.has(key) &&
        ![...prefixes].some((prefix) => key.startsWith(prefix))
    );

    expect(unsaid).toEqual([]);
  });

  it("finds the messages and the sources at all", () => {
    // If a move emptied either side, the check above would pass by looking at nothing.
    expect(keysOf("en.ts").length).toBeGreaterThan(1000);
    expect(sources().length).toBeGreaterThan(300);
  });
});
