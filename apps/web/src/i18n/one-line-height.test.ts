import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A line of text is as tall in English as in Bangla, so changing the language moves nothing on the page.
 *
 * The type scale gives each size one line height in rem, the same in both languages (globals.css). A line height
 * written as a ratio — `leading-tight`, `text-sm/relaxed` — is a multiple of the font's size, and Bangla's letters
 * are larger, so the same element came out a few pixels taller in Bangla and the page jumped on every switch: form
 * labels, the Playbook's figures, a shed's heading. A component that wants its own line height writes it in rem
 * (`leading-6`, `leading-[2.25rem]`), which is the same in both.
 */
const ROOTS = ["src", "../../packages/ui/src/components"];
const RATIO =
  /\bleading-(?:none|tight|snug|normal|relaxed|loose)\b|\btext-[a-z0-9]+\/(?:none|tight|snug|normal|relaxed|loose)\b/gu;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "prototype" ? [] : walk(full);
    }
    return /\.tsx?$/u.test(name) && !name.includes(".test.") ? [full] : [];
  });

describe("a line of text", () => {
  it("is given its height by the type scale, never as a ratio of its font", () => {
    const ratios = ROOTS.flatMap(walk).flatMap((file) =>
      [...readFileSync(file, "utf-8").matchAll(RATIO)].map(
        (found) => `${file}: ${found[0]}`
      )
    );

    expect(ratios).toEqual([]);
  });
});
