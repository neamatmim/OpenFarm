import { describe, expect, it } from "vitest";

import { samplesLeft } from "./samples-left";

// A production server refuses to start on a setting still holding .env.example's sample, rather than run with an
// Owner's address nobody on the farm holds.

describe("settings left as the example had them", () => {
  it("are named, each one", () => {
    expect(
      samplesLeft({
        BETTER_AUTH_URL: "https://farm.example.com",
        OPENFARM_OWNER_EMAIL: "owner@example.com",
        VAPID_SUBJECT: "mailto:owner@example.org",
        PORTAL_URL: "https://investors.farm.example.com/",
      })
    ).toEqual([
      "BETTER_AUTH_URL",
      "PORTAL_URL",
      "OPENFARM_OWNER_EMAIL",
      "VAPID_SUBJECT",
    ]);
  });

  it("leave a farm's own addresses alone, and settings left out", () => {
    expect(
      samplesLeft({
        BETTER_AUTH_URL: "https://shapla-farm.com.bd",
        OPENFARM_OWNER_EMAIL: "owner@myexample.com",
        VAPID_SUBJECT: "mailto:karim@example-farm.com",
      })
    ).toEqual([]);
    expect(samplesLeft({})).toEqual([]);
  });
});
