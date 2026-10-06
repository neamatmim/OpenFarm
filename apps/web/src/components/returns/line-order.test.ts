import { describe, expect, it } from "vitest";

import { lineOrder } from "./line-order";

const band = (fromKg: number | null, toKg: number | null) => ({
  line: { kind: "band" as const, fromKg, toKg },
  said: `${fromKg ?? ""}–${toKg ?? ""} kg`,
});

const named = (said: string) => ({
  line: { kind: "named" as const },
  said,
});

describe("the lines of a breakdown, in order", () => {
  it("puts buying weights lightest first, not by how their words sort", () => {
    const rows = [
      band(150, 200),
      { line: { kind: "none" as const }, said: "No weight" },
      band(50, 100),
      band(200, null),
      band(null, 50),
      band(100, 150),
    ];
    expect(rows.toSorted(lineOrder).map((one) => one.said)).toEqual([
      "–50 kg",
      "50–100 kg",
      "100–150 kg",
      "150–200 kg",
      "200– kg",
      "No weight",
    ]);
  });

  it("puts every other line by what it is called", () => {
    expect(
      [named("Savar"), named("Gabtoli")]
        .toSorted(lineOrder)
        .map((one) => one.said)
    ).toEqual(["Gabtoli", "Savar"]);
  });
});
