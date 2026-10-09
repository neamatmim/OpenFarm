import { describe, expect, it } from "vitest";

import type { VentureHolding } from "./venture-herd-as-of";
import { headsAt, herdBetween } from "./venture-herd-as-of";

// A Venture's herd as it stood at a moment, and what moved it between two. Worked by hand: five bulls come off the lorry
// on 4 January at 200 kg, a sixth is bought across from another Venture on 20 January at 230 kg; one dies on 5 February,
// one is sold across on 10 February, one goes to a buyer on 18 February at 240 kg. The scale reads them on 1 and 15
// February — and once on 2 March, after the month asked about.

const at = (instant: string) => new Date(instant);
const JAN_4 = at("2052-01-04T05:00:00.000Z");
const FEB = {
  from: at("2052-01-31T18:00:00.000Z"),
  until: at("2052-02-29T18:00:00.000Z"),
};
const JAN = { from: at("2051-12-31T18:00:00.000Z"), until: FEB.from };
const DAY = 24 * 60 * 60 * 1000;

const bought = (
  tagNumber: string,
  rest: Partial<VentureHolding> = {}
): VentureHolding => ({
  animalId: tagNumber,
  tagNumber,
  from: JAN_4,
  cameBy: "intake",
  cameKg: 200,
  until: null,
  wentBy: null,
  soldKg: null,
  readings: [],
  ...rest,
});

const HERD: VentureHolding[] = [
  // Weighed on 1 February at 228, and again on 2 March at 240: the March reading is after February.
  bought("A", {
    readings: [
      { kg: 228, at: at("2052-02-01T07:30:00.000Z") },
      { kg: 240, at: at("2052-03-02T07:30:00.000Z") },
    ],
  }),
  // Never weighed.
  bought("B"),
  // Weighed on 1 February, died on the 5th.
  bought("C", {
    until: at("2052-02-05T05:00:00.000Z"),
    wentBy: "died",
    readings: [{ kg: 228, at: at("2052-02-01T07:30:00.000Z") }],
  }),
  // Sold across to another Venture on 10 February, weighed on the 1st.
  bought("D", {
    until: at("2052-02-09T18:00:00.000Z"),
    wentBy: "internal_sale",
    readings: [{ kg: 228, at: at("2052-02-01T07:30:00.000Z") }],
  }),
  // To a buyer on the 18th at 240 kg at the gate.
  bought("E", {
    until: at("2052-02-18T05:00:00.000Z"),
    wentBy: "sold",
    soldKg: 240,
    readings: [{ kg: 228, at: at("2052-02-01T07:30:00.000Z") }],
  }),
  // Bought across on 20 January at 230 kg, weighed on 15 February at 236.
  bought("F", {
    from: at("2052-01-19T18:00:00.000Z"),
    cameBy: "internal_sale",
    cameKg: 230,
    readings: [{ kg: 236, at: at("2052-02-15T07:30:00.000Z") }],
  }),
];

describe("a Venture's herd at a moment", () => {
  it("counts those that had come before it and had not gone before it", () => {
    expect(headsAt(HERD, at("2052-01-04T04:00:00.000Z"))).toBe(0);
    expect(headsAt(HERD, JAN.until)).toBe(6);
    expect(headsAt(HERD, at("2052-02-06T00:00:00.000Z"))).toBe(5);
    expect(headsAt(HERD, at("2052-02-11T00:00:00.000Z"))).toBe(4);
    expect(headsAt(HERD, FEB.until)).toBe(3);
  });
});

describe("a Venture's herd between two moments", () => {
  it("says what came and went, so the heads at the start and what moved make the heads at the end", () => {
    const january = herdBetween(HERD, JAN);
    expect(january).toMatchObject({
      atStart: 0,
      atEnd: 6,
      came: { bought: 5, boughtAcross: 1 },
      went: { sold: 0, soldAcross: 0, died: 0, lost: 0 },
    });

    const february = herdBetween(HERD, FEB);
    expect(february).toMatchObject({
      atStart: 6,
      atEnd: 3,
      came: { bought: 0, boughtAcross: 0 },
      went: { sold: 1, soldAcross: 1, died: 1, lost: 0 },
    });
  });

  it("weighs the herd at the end by each one's last reading before it — never one after — or what she came at", () => {
    const february = herdBetween(HERD, FEB);

    // Standing at the end: A at 228 (her 2 March 240 is after it) and F at 236. B, never weighed, is in neither: at
    // what she came at she would flatten the growth the figure is there to show.
    expect(february.atEndKg).toEqual({ averageKg: 232, animals: 2 });
  });

  it("pools the month's gain from each one's last weight before it to her last in it, naming those not weighed in it", () => {
    const february = herdBetween(HERD, FEB);

    // A, C, D: 28 kg each since arriving, over 28.1 days to 1 February; E: 40 kg to 240 at the gate, over 45 days;
    // F: 6 kg from 230 on 20 January to 236 on 15 February, over 26.6 days. B was never weighed.
    const kilos = 28 * 3 + 40 + 6;
    const days =
      ((at("2052-02-01T07:30:00.000Z").getTime() - JAN_4.getTime()) / DAY) * 3 +
      (at("2052-02-18T05:00:00.000Z").getTime() - JAN_4.getTime()) / DAY +
      (at("2052-02-15T07:30:00.000Z").getTime() -
        at("2052-01-19T18:00:00.000Z").getTime()) /
        DAY;
    expect(february.gainKgPerDay).toBe(Math.round((kilos / days) * 100) / 100);
    expect(february.weighed).toBe(5);
    expect(february.notWeighed).toEqual(["B"]);
  });

  it("says nothing of a gain where nobody was weighed in it", () => {
    const january = herdBetween(HERD, JAN);

    expect(january.gainKgPerDay).toBeNull();
    expect(january.weighed).toBe(0);
    expect(january.notWeighed).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("counts a cull with the dead, and a loss apart", () => {
    const march = { from: FEB.until, until: at("2052-03-31T18:00:00.000Z") };
    const herd = [
      bought("G", { until: at("2052-03-03T05:00:00.000Z"), wentBy: "culled" }),
      bought("H", { until: at("2052-03-04T05:00:00.000Z"), wentBy: "lost" }),
    ];

    expect(herdBetween(herd, march).went).toEqual({
      sold: 0,
      soldAcross: 0,
      died: 1,
      lost: 1,
    });
  });

  it("names a bull bought across mid-month and weighed only under his seller as not weighed by the Venture", () => {
    const herd = [
      bought("J", {
        from: at("2052-02-14T18:00:00.000Z"),
        cameBy: "internal_sale",
        cameKg: 240,
        readings: [{ kg: 238, at: at("2052-02-10T07:30:00.000Z") }],
      }),
    ];

    const february = herdBetween(herd, FEB);
    expect(february.weighed).toBe(0);
    expect(february.notWeighed).toEqual(["J"]);
    expect(february.atEndKg).toBeNull();
  });
});
