import { describe, expect, it } from "vitest";

import { fieldOfMoment, momentOfField } from "./farm-moment";

// A date and time a person types is the farm's: a phone set a zone away — the Owner's own phone abroad — must neither
// show a calving shifted nor store one hours off.

describe("a moment in a date-and-time box", () => {
  it("is shown on the farm's clock, whatever the phone's", () => {
    // Three in the morning on the 24th in Dhaka is nine at night on the 23rd UTC.
    expect(fieldOfMoment("2032-03-23T21:00:00.000Z")).toBe("2032-03-24T03:00");
    expect(fieldOfMoment("")).toBe("");
  });

  it("is read as the farm's day and time", () => {
    expect(momentOfField("2032-03-24T03:00")).toBe("2032-03-23T21:00:00.000Z");
    expect(momentOfField("")).toBe("");
  });
});
