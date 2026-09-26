import { describe, expect, it } from "vitest";

import { trustedAt, whyRefused } from "./rpc-door";

// The farm's API answers the app's own pages and its Shed Phones. A browser attaches the sign-in cookie to any
// request for the farm's address, whoever's page sent it, so the door looks at where a request came from and how.

const FARM = "https://farm.example.com";
const TRUSTED = [FARM];
const call = (path: string, init: RequestInit = {}) =>
  new Request(`${FARM}${path}`, init);

describe("the API's door", () => {
  it("lets the app's own pages and the Shed Phones in, by POST", () => {
    expect(
      whyRefused(
        call("/api/rpc/animals/list", {
          method: "POST",
          headers: { origin: FARM, "sec-fetch-site": "same-origin" },
        }),
        TRUSTED
      )
    ).toBeNull();
    // A phone's own requests carry no Origin at all.
    expect(
      whyRefused(call("/api/rpc/animals/list", { method: "POST" }), TRUSTED)
    ).toBeNull();
  });

  it("does not act on a link, even from a browser that does not say where it came from", () => {
    // Older Android WebViews and Safari send no Sec-Fetch-Site, so a GET cannot be told apart from a link
    // followed on another site. The app never sends one, so none is taken.
    expect(
      whyRefused(call("/api/rpc/people/newPasswordCode?data=x"), TRUSTED)
    ).toBe("not-by-link");
    expect(
      whyRefused(call("/api/rpc/animals/list", { method: "HEAD" }), TRUSTED)
    ).toBe("not-by-link");
  });

  it("still shows the API reference to a browser", () => {
    expect(whyRefused(call("/api/rpc/api-reference"), TRUSTED)).toBeNull();
  });

  it("turns away another website's page, however it asks", () => {
    expect(
      whyRefused(
        call("/api/rpc/animals/list", {
          method: "POST",
          headers: { origin: "https://elsewhere.example" },
        }),
        TRUSTED
      )
    ).toBe("another-site");
    expect(
      whyRefused(
        call("/api/rpc/api-reference", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
        TRUSTED
      )
    ).toBe("another-site");
  });

  it("trusts only the address a request arrived on, where the portal has one of its own", () => {
    const PORTAL = "https://investors.farm.example.com";
    const hosts = { farm: FARM, portal: PORTAL };
    const toThePortal = (from: string) =>
      new Request(`${PORTAL}/api/rpc/portal/me`, {
        method: "POST",
        // One site to a browser, so it is not "cross-site": only the origin tells the two apart.
        headers: { origin: from, "sec-fetch-site": "same-site" },
      });
    const toTheFarm = (from: string) =>
      call("/api/rpc/animals/list", {
        method: "POST",
        headers: { origin: from, "sec-fetch-site": "same-site" },
      });
    const refusedAt = (request: Request) =>
      whyRefused(request, trustedAt(request.url, hosts));

    expect(refusedAt(toThePortal(FARM))).toBe("another-site");
    expect(refusedAt(toTheFarm(PORTAL))).toBe("another-site");
    expect(refusedAt(toThePortal(PORTAL))).toBeNull();
    expect(refusedAt(toTheFarm(FARM))).toBeNull();
  });
});
