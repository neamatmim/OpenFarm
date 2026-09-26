import { readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";

import { describe, expect, it } from "vitest";

import { atTheWrongAddress } from "./two-addresses";

// Each of the farm's two addresses serves only its own people (ADR 0009). Strangers typing the Investor address reach
// the portal's own pages and calls and nothing else of the farm app; a portal page asked for at the farm's address is
// sent to the same page on the portal's.

const FARM = "https://farm.example.com";
const PORTAL = "https://investors.farm.example.com";
const TWO = { farm: FARM, portal: PORTAL };

const asked = (url: string, method = "GET") =>
  atTheWrongAddress(new Request(url, { method }), TWO);

describe("the Investor address", () => {
  it("opens the portal from its bare address", () => {
    const answer = asked(`${PORTAL}/`);

    expect(answer?.status).toBe(302);
    expect(answer?.headers.get("location")).toBe(`${PORTAL}/portal`);
  });

  it("serves the portal's pages, its sign-in and its own calls", () => {
    for (const [path, method] of [
      ["/portal", "GET"],
      ["/portal/login", "GET"],
      ["/portal/ventures/abc", "GET"],
      ["/assets/index-abc.js", "GET"],
      ["/icon.svg", "GET"],
      ["/portal.webmanifest", "GET"],
      ["/api/auth/sign-in/email", "POST"],
      ["/api/auth/sign-out", "POST"],
      ["/api/auth/get-session", "GET"],
      ["/api/auth/change-password", "POST"],
      ["/api/auth/revoke-other-sessions", "POST"],
      ["/api/rpc/portal/me", "POST"],
      ["/api/rpc/people/me", "POST"],
      ["/api/rpc/language/set", "POST"],
      ["/_serverFn/abc123", "GET"],
    ] as const) {
      expect(asked(`${PORTAL}${path}`, method), path).toBeNull();
    }
  });

  it("serves nothing else of the farm app", () => {
    for (const path of [
      "/login",
      "/dashboard",
      "/investors/abc/as-they-see-it",
      "/api/auth/sign-up/email",
      "/api/auth/request-password-reset",
      "/api/rpc/animals/list",
      "/api/rpc/portalPreview/me",
      "/api/rpc/people/newPasswordCode",
      "/api/rpc/api-reference",
      "/sw.js",
      "/portalish",
    ]) {
      expect(asked(`${PORTAL}${path}`)?.status, path).toBe(404);
    }
  });
});

describe("the farm's address", () => {
  it("sends a portal page to the same page on the Investor address, for good", () => {
    const answer = asked(`${FARM}/portal/ventures/abc?paper=joining`);

    expect(answer?.status).toBe(301);
    expect(answer?.headers.get("location")).toBe(
      `${PORTAL}/portal/ventures/abc?paper=joining`
    );
    expect(asked(`${FARM}/portal`)?.headers.get("location")).toBe(
      `${PORTAL}/portal`
    );
  });

  it("serves everything else as it always has, the Owner's Preview included", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/investors/abc/as-they-see-it",
      "/api/rpc/portalPreview/me",
      "/portalish",
    ]) {
      expect(asked(`${FARM}${path}`), path).toBeNull();
    }
  });

  it("keeps the portal at /portal while it has no address of its own", () => {
    const one = { farm: FARM, portal: null };

    expect(
      atTheWrongAddress(new Request(`${FARM}/portal/login`), one)
    ).toBeNull();
  });
});

/** Every source file of the app, to read what it declares. */
const sourcesUnder = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const found = nodePath.join(folder, entry.name);
    if (entry.isDirectory()) {
      return sourcesUnder(found);
    }
    return /\.tsx?$/u.test(entry.name) ? [found] : [];
  });

describe("the server functions", () => {
  it("are only the one the Investor address lets strangers reach on purpose", () => {
    // Every server function answers at /_serverFn on the Investor address too, where the portal's pages ask who is
    // signed in. A new one reaches strangers there: say here that it may, or keep it off the portal's address first.
    const app = nodePath.join(import.meta.dirname, "..");
    const declaring = sourcesUnder(app)
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) => readFileSync(file, "utf-8").includes("createServerFn("))
      .map((file) => nodePath.relative(app, file));

    expect(declaring).toEqual(["functions/get-user.ts"]);
  });
});
