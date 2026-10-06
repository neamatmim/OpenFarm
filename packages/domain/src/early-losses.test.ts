import { describe, expect, it } from "vitest";

import { earlyLosses } from "./early-losses";

const at = (day: string) => new Date(`${day}T06:00:00.000Z`);
const stretch = { from: at("2026-01-01"), until: at("2027-01-01") };

describe("early losses by seller and by livestock market", () => {
  const bought = [
    {
      animalId: "a",
      seller: "করিম",
      livestockMarket: "গাবতলী",
      arrivedAt: at("2026-03-01"),
    },
    {
      animalId: "b",
      seller: "করিম",
      livestockMarket: "গাবতলী",
      arrivedAt: at("2026-03-01"),
    },
    {
      animalId: "c",
      seller: "করিম",
      livestockMarket: null,
      arrivedAt: at("2026-03-01"),
    },
    {
      animalId: "d",
      seller: "রহিম",
      livestockMarket: "সাভার",
      arrivedAt: at("2026-03-01"),
    },
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
      {
        name: "করিম",
        bought: 3,
        died: 1,
        culled: 0,
        diagnosed: 1,
        weighedShort: 0,
      },
    ]);
    expect(losses.byLivestockMarket).toEqual([
      {
        name: "গাবতলী",
        bought: 2,
        died: 1,
        culled: 0,
        diagnosed: 1,
        weighedShort: 0,
      },
    ]);
  });

  it("counts one livestock market however its name was typed", () => {
    // "Gabtoli" on Monday's lorry, "gabtoli " on Friday's: one market, and its two dead bulls one pattern.
    const typed = [
      {
        animalId: "e",
        seller: "জব্বার",
        livestockMarket: "Gabtoli",
        arrivedAt: at("2026-05-04"),
      },
      {
        animalId: "f",
        seller: "জব্বার",
        livestockMarket: "gabtoli ",
        arrivedAt: at("2026-05-08"),
      },
    ];
    const losses = earlyLosses(
      typed,
      [
        { animalId: "e", kind: "died", at: at("2026-05-10") },
        { animalId: "f", kind: "died", at: at("2026-05-12") },
      ],
      [],
      stretch
    );
    expect(losses.byLivestockMarket).toEqual([
      expect.objectContaining({ name: "Gabtoli", bought: 2, died: 2 }),
    ]);
  });

  it("names nobody where nothing was lost early", () => {
    expect(earlyLosses(bought, [], [], stretch)).toEqual({
      bySeller: [],
      byLivestockMarket: [],
    });
  });

  it("names a seller whose bulls weighed short at their first weighing, though none was lost", () => {
    const weighed = (
      animalId: string,
      seller: string,
      weightKg: number,
      day = "2026-03-13"
    ) => ({
      animalId,
      seller,
      livestockMarket: "হাটহাজারী",
      arrivedAt: at("2026-03-01"),
      arrivalKg: 280,
      firstWeighIn: { weightKg, at: at(day) },
    });
    const losses = earlyLosses(
      [
        weighed("e", "সালাম", 255),
        weighed("f", "সালাম", 250),
        // Within the line: 270 kg is under 4% short.
        weighed("g", "জব্বার", 270),
        // Short, but first weighed past thirty days.
        weighed("h", "জব্বার", 240, "2026-04-05"),
        // Never weighed.
        {
          animalId: "i",
          seller: "জব্বার",
          livestockMarket: null,
          arrivedAt: at("2026-03-01"),
        },
      ],
      [],
      [],
      { ...stretch, shortPercent: 5 }
    );
    expect(losses.bySeller).toEqual([
      {
        name: "সালাম",
        bought: 2,
        died: 0,
        culled: 0,
        diagnosed: 0,
        weighedShort: 2,
      },
    ]);
    expect(losses.byLivestockMarket).toEqual([
      expect.objectContaining({ name: "হাটহাজারী", weighedShort: 2 }),
    ]);
  });
});
