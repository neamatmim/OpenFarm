import { uuidv7 } from "@OpenFarm/db/ids";
import { describe, expect, it } from "vitest";

describe("uuidv7", () => {
  it("is a v7 uuid with the RFC variant", () => {
    const id = uuidv7(new Date("2026-09-11T00:00:00.000Z"));

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

  it("sorts by time", () => {
    const early = uuidv7(new Date(1000));
    const late = uuidv7(new Date(2000));

    expect(early < late).toBe(true);
  });

  it("sorts in the order taken, even within one millisecond", () => {
    const instant = new Date("2026-09-11T04:00:00.000Z");
    const ids = [
      uuidv7(instant),
      uuidv7(instant),
      uuidv7(instant),
      uuidv7(instant),
    ];

    expect(ids.toSorted()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("encodes the timestamp it was given", () => {
    const id = uuidv7(new Date(0x01_93_1c_8b_2f_00));

    expect(id.startsWith("01931c8b-2f00")).toBe(true);
  });
});
