import { describe, expect, it } from "vitest";

import { portalAddress, portalAddressTyped } from "./portal-address";

// Where an Investor is sent, as the Welcome Letter, its QR and the code dialog print it: the portal's own address once
// it has one (ADR 0009), short enough to type; `/portal` on the farm's while it has not.

const OWN = "https://investors.farm.example.com";

describe("the portal's address, as it is printed", () => {
  it("is the portal's own bare address, and its pages under /portal, once it has one", () => {
    expect(portalAddress(OWN)).toBe(OWN);
    expect(portalAddress(OWN, "/join")).toBe(`${OWN}/portal/join`);
    expect(portalAddressTyped(OWN)).toBe("investors.farm.example.com");
  });

  it("is /portal on the address the page is on while the portal has none of its own", () => {
    expect(portalAddress(null, "/join")).toMatch(/\/portal\/join$/u);
  });
});
