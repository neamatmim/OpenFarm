import { describe, expect, it } from "vitest";

import { weighedShort } from "./arrival-weight";

const arrived = { arrivalKg: 280, arrivedAt: new Date("2030-03-01T04:00:00Z") };
const on = (days: number, weightKg: number) => ({
  weightKg,
  weighedAt: new Date(arrived.arrivedAt.getTime() + days * 86_400_000),
});

describe("weighedShort", () => {
  it("names the kilos and the part short past the line", () => {
    expect(weighedShort(arrived, on(12, 255), 5)).toEqual({
      shortKg: 25,
      percent: 8.9,
      days: 12,
    });
  });

  it("says nothing within the line, or for a heavier bull", () => {
    expect(weighedShort(arrived, on(12, 270), 5)).toBeNull();
    expect(weighedShort(arrived, on(12, 266), 5)).toBeNull();
    expect(weighedShort(arrived, on(12, 300), 5)).toBeNull();
  });

  it("says nothing past the first thirty days", () => {
    expect(weighedShort(arrived, on(29.9, 250), 5)).not.toBeNull();
    expect(weighedShort(arrived, on(30, 250), 5)).toBeNull();
  });
});
