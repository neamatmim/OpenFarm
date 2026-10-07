import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SHED_ROUTES, buildOf } from "./keep-the-build";

// After a deploy a shed screen not yet opened with signal was not on the phone. The page loads the shed's screens
// ahead, by route id, and tells the service worker which build it is so older builds' files are let go.

describe("the shed's screens kept ahead", () => {
  it("are every one a route the app has: a renamed route would quietly stop being kept", () => {
    const tree = readFileSync(
      new URL("../routeTree.gen.ts", import.meta.url),
      "utf-8"
    );
    const missing = SHED_ROUTES.filter((id) => !tree.includes(`id: '${id}'`));
    expect(missing).toEqual([]);
  });
});

describe("which build a page is", () => {
  it("is its own first built file, and nothing in development", () => {
    expect(
      buildOf({
        routes: {
          __root__: { preloads: [{ href: "/assets/main-a1b2.js" }, "/x.js"] },
        },
      })
    ).toBe("/assets/main-a1b2.js");
    expect(
      buildOf({ routes: { __root__: { preloads: ["/src/main.tsx"] } } })
    ).toBeNull();
    expect(buildOf({ routes: {} })).toBeNull();
  });
});
