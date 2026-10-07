import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * What a route checks before its page is drawn — its address, its loader — goes into the entry every screen downloads
 * first, with everything it imports. The portal's address checks lived in the portal's pages and the home pages' tab
 * words in the home pages, so the shed's first screen downloaded the Owner's home, the fattening board and the
 * portal's Venture pages: 202 files where 93 do (2026-10-07). A route's config may use the app's components only
 * through the small modules kept for it.
 */
const ROUTES = "src/routes";

/** The components a route's config may read: small, and kept apart from their pages for exactly this. */
const KEPT_FOR_ROUTES = new Set([
  "@/components/home/queue-kinds",
  "@/components/fattening/fattening-filters",
  "@/components/portal/pages/page-search",
  // The landing each Role opens on, read by the app's own shell anyway.
  "@/components/shell/navigation",
]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.tsx?$/u.test(name) && !name.includes(".test.") ? [full] : [];
  });

/** The `createFileRoute(…)({ … })` options, whole, by counting braces. */
const optionsOf = (source: string): string | null => {
  const start = source.indexOf(")({", source.indexOf("createFileRoute("));
  if (start === -1 || !source.includes("createFileRoute(")) {
    return null;
  }
  let depth = 0;
  for (let at = start + 2; at < source.length; at += 1) {
    if (source[at] === "{") {
      depth += 1;
    } else if (source[at] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start + 2, at + 1);
      }
    }
  }
  return null;
};

const COMPONENT_KEY =
  /\b(?:component|pendingComponent|errorComponent|notFoundComponent)\s*:\s*\w+\s*,?/gu;
const IMPORT =
  /import\s*\{(?<names>[^}]*)\}\s*from\s*"(?<from>@\/components\/[^"]+)"/gu;

const componentsReadByConfigs = (): string[] => {
  const found: string[] = [];
  for (const file of walk(ROUTES)) {
    const source = readFileSync(file, "utf-8");
    const options = optionsOf(source);
    if (!options) {
      continue;
    }
    const used = new Set(options.replaceAll(COMPONENT_KEY, "").match(/\w+/gu));
    for (const imported of source.matchAll(IMPORT)) {
      const from = imported.groups?.from ?? "";
      const names = (imported.groups?.names ?? "")
        .split(",")
        .map((one) => one.trim())
        .filter((one) => one !== "" && !one.startsWith("type "))
        .map((one) => one.split(" as ").at(-1) ?? one);
      if (!KEPT_FOR_ROUTES.has(from) && names.some((name) => used.has(name))) {
        found.push(`${path.relative(ROUTES, file)} reads ${from}`);
      }
    }
  }
  return found.toSorted();
};

describe("a route's own options", () => {
  it("read no page module, only the small ones kept for them", () => {
    expect(componentsReadByConfigs()).toEqual([]);
  });

  it("are found at all", () => {
    // If the reading of options went blind, the guard above would pass by reading nothing.
    const withOptions = walk(ROUTES).filter((file) =>
      optionsOf(readFileSync(file, "utf-8"))
    );
    expect(withOptions.length).toBeGreaterThan(100);
  });
});
