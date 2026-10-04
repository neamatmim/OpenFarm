import { describe, expect, it } from "vitest";

import { stockingOf } from "./stocking";

describe("how full a Pen is", () => {
  it("has room for what its capacity leaves", () => {
    expect(stockingOf(12, 15)).toEqual({
      head: 12,
      capacity: 15,
      room: 3,
      over: 0,
    });
  });

  it("is over by the animals past its capacity, and has no room", () => {
    expect(stockingOf(18, 15)).toEqual({
      head: 18,
      capacity: 15,
      room: 0,
      over: 3,
    });
  });

  it("is full, not over, at its capacity", () => {
    expect(stockingOf(15, 15)).toEqual({
      head: 15,
      capacity: 15,
      room: 0,
      over: 0,
    });
  });

  it("says nothing of room until a capacity is set", () => {
    expect(stockingOf(40, null)).toBeNull();
  });

  it("counts the animals walking in before it says", () => {
    expect(stockingOf(12, 15, 5)).toEqual({
      head: 17,
      capacity: 15,
      room: 0,
      over: 2,
    });
  });
});
