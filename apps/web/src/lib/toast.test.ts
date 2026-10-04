import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** The one file that may speak to Sonner itself: every other toast goes through it, so an error waits to be read. */
const THE_APPS_TOASTS = path.join("src", "lib", "toast.ts");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.tsx?$/u.test(name) && !name.includes(".test.") ? [full] : [];
  });

describe("the app's toasts", () => {
  it("are all raised through lib/toast, never straight from Sonner", () => {
    const straight = walk("src").filter(
      (file) =>
        file !== THE_APPS_TOASTS &&
        /from ["']sonner["']/u.test(readFileSync(file, "utf-8"))
    );

    expect(straight).toEqual([]);
  });
});
