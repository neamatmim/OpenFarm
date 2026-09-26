import { describe, expect, it } from "vitest";

import { WIPE, withTheWipe, wipesTheDevice } from "./wipe";

// Leaving the portal on its own address leaves nothing of it on a shared family phone (ADR 0009): signing out, and
// the first visit after a sign-in has run its day, tell the browser to wipe that address. Never on the farm's, where a
// milker's unsent Outbox lives.

const PORTAL = "https://investors.farm.example.com";
const FARM = "https://farm.example.com";

const asked = (url: string, method = "GET") => new Request(url, { method });

describe("the wipe", () => {
  it("is everything the browser keeps for the address, but never its cookies", () => {
    // Cookies are wiped for the whole farm domain at once, the farm's own address with it: a portal sign-out would
    // sign that browser out of the farm too. Signing out takes away the portal's own cookie itself.
    expect(WIPE).toBe('"cache", "storage"');
  });

  it("goes with signing out, and with the sign-in page a day-long sign-in is sent to, on the Investor address", () => {
    expect(
      wipesTheDevice(asked(`${PORTAL}/api/auth/sign-out`, "POST"), "portal")
    ).toBe(true);
    expect(
      wipesTheDevice(asked(`${PORTAL}/portal/login?ended=true`), "portal")
    ).toBe(true);
  });

  it("goes with nothing else there", () => {
    expect(wipesTheDevice(asked(`${PORTAL}/portal/login`), "portal")).toBe(
      false
    );
    expect(
      wipesTheDevice(
        asked(`${PORTAL}/api/auth/sign-in/email`, "POST"),
        "portal"
      )
    ).toBe(false);
    expect(wipesTheDevice(asked(`${PORTAL}/portal`), "portal")).toBe(false);
  });

  it("never goes with anything on the farm's address, where the Outbox lives", () => {
    expect(
      wipesTheDevice(asked(`${FARM}/api/auth/sign-out`, "POST"), "farm")
    ).toBe(false);
    expect(
      wipesTheDevice(asked(`${FARM}/portal/login?ended=true`), "farm")
    ).toBe(false);
  });
});

describe("an answer on its way out", () => {
  it("carries the wipe where it should, and nothing else changes", () => {
    const signedOut = withTheWipe(
      asked(`${PORTAL}/api/auth/sign-out`, "POST"),
      "portal",
      new Response("{}", { status: 200, headers: { "x-kept": "yes" } })
    );
    const staffOut = withTheWipe(
      asked(`${FARM}/api/auth/sign-out`, "POST"),
      "farm",
      new Response("{}", { status: 200 })
    );

    expect(signedOut.headers.get("clear-site-data")).toBe(WIPE);
    expect(signedOut.headers.get("x-kept")).toBe("yes");
    expect(signedOut.status).toBe(200);
    expect(staffOut.headers.has("clear-site-data")).toBe(false);
  });
});
