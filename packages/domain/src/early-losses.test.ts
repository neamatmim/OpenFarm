import { describe, expect, it } from "vitest";

import { earlyLosses } from "./early-losses";

const at = (day: string) => new Date(`${day}T06:00:00.000Z`);
const stretch = { from: at("2026-01-01"), until: at("2027-01-01") };

describe("early losses by seller and by haat", () => {
  const bought = [
    {
      animalId: "a",
      seller: "করিম",
      haat: "গাবতলী",
      arrivedAt: at("2026-03-01"),
    },
    {
      animalId: "b",
      seller: "করিম",
      haat: "গাবতলী",
      arrivedAt: at("2026-03-01"),
    },
    { animalId: "c", seller: "করিম", haat: null, arrivedAt: at("2026-03-01") },
    { animalId: "d", seller: "রহিম", haat: "সাভার", arrivedAt: at("2026-03-01") },
  ];

  it("counts a death, a cull and a Diagnosis within thirty days of arrival, the most lost first", () => {
    const losses = earlyLosses(
      bought,
      [
        { animalId: "a", kind: "died", at: at("2026-03-10") },
        // Thirty-one days on: not early.
        { animalId: "d", kind: "died", at: at("2026-04-01") },
      ],
      [
        { animalId: "b", at: at("2026-03-05") },
        { animalId: "b", at: at("2026-03-07") },
      ],
      stretch
    );
    expect(losses.bySeller).toEqual([
      { name: "করিম", bought: 3, died: 1, culled: 0, diagnosed: 1 },
    ]);
    expect(losses.byHaat).toEqual([
      { name: "গাবতলী", bought: 2, died: 1, culled: 0, diagnosed: 1 },
    ]);
  });

  it("names nobody where nothing was lost early", () => {
    expect(earlyLosses(bought, [], [], stretch)).toEqual({
      bySeller: [],
      byHaat: [],
    });
  });
});
