import { describe, expect, it } from "vitest";

import {
  daysInMilk,
  destinationFor,
  lactationSummary,
  lactationView,
  litersPerCowMilked,
  litersTo,
  calvesDrankADay,
  milkAccountOf,
  milkDropOf,
  reconcile,
} from "./milk";

// Where a cow's milk went, and what the tank says about it. The gate below is one of the two mistakes
// the farm cannot afford, so it is asserted from both sides: what it forces, and what it leaves alone.

const at = (dayAndTime: string) => new Date(`2027-${dayAndTime}+06:00`);

describe("where a Milk Record actually goes", () => {
  it("pours a held-back cow's milk away whatever the phone asked for", () => {
    // The phone evaluates the gate from its last sync and may be stale, so the answer is taken out of
    // the person's hands here.
    expect(destinationFor("bulk", true)).toEqual({
      destination: "discard",
      forced: true,
    });
    expect(destinationFor("calves", true)).toEqual({
      destination: "discard",
      forced: true,
    });
  });

  it("does not call it forced when she poured it away herself", () => {
    // Both end in Discard; only one was taken out of her hands, and the liters have to be tellable
    // apart from milk somebody chose to pour away.
    expect(destinationFor("discard", true)).toEqual({
      destination: "discard",
      forced: false,
    });
  });

  it("leaves a clear cow's milk where it was sent", () => {
    for (const asked of ["bulk", "calves", "discard"] as const) {
      expect(destinationFor(asked, false)).toEqual({
        destination: asked,
        forced: false,
      });
    }
  });
});

describe("the tank against the cows", () => {
  it("takes the difference as a share of what the cows account for", () => {
    expect(reconcile(105, 100, 5)).toMatchObject({
      differenceLiters: 5,
      differencePercent: 5,
    });
  });

  it("does not flag a difference exactly at the tolerance", () => {
    expect(reconcile(105, 100, 5).flagged).toBe(false);
    expect(reconcile(106, 100, 5).flagged).toBe(true);
  });

  it("minds a tank that held less just as much as one that held more", () => {
    expect(reconcile(95, 100, 5)).toMatchObject({
      differenceLiters: -5,
      differencePercent: 5,
      flagged: false,
    });
    expect(reconcile(94, 100, 5).flagged).toBe(true);
  });

  it("counts milk in a tank no cow accounts for as entirely unaccounted for", () => {
    expect(reconcile(12, 0, 5)).toMatchObject({
      differenceLiters: 12,
      differencePercent: 100,
      flagged: true,
    });
  });

  it("has nothing to flag when there was nothing either side", () => {
    expect(reconcile(0, 0, 5)).toEqual({
      sumBulkLiters: 0,
      differenceLiters: 0,
      differencePercent: 0,
      flagged: false,
    });
  });

  it("keeps liters and percentages to the two decimals the record keeps", () => {
    expect(reconcile(100.333, 100, 5)).toMatchObject({
      differenceLiters: 0.33,
      differencePercent: 0.33,
    });
  });
});

describe("how long she has been in milk", () => {
  const calved = at("01-10T06:00:00");

  it("counts the day she calved as day nought", () => {
    expect(daysInMilk(calved, calved)).toBe(0);
    expect(daysInMilk(calved, at("01-20T06:00:00"))).toBe(10);
  });

  it("says nothing at all when no Lactation is running", () => {
    // Rather than a misleading nought.
    expect(daysInMilk(null, at("01-20T06:00:00"))).toBe(null);
  });

  it("never counts backwards", () => {
    expect(daysInMilk(calved, at("01-01T06:00:00"))).toBe(0);
  });

  it("is shown only while she is milking", () => {
    const she = { lactationNumber: 3, lactationStartedAt: calved };
    expect(
      lactationView({ ...she, state: "milking" }, at("01-20T06:00:00"))
        .daysInMilk
    ).toBe(10);
    // Dry, and her lactation number and start are still hers — the days are not.
    expect(
      lactationView({ ...she, state: "dry" }, at("01-20T06:00:00"))
    ).toEqual({
      lactationNumber: 3,
      lactationStartedAt: calved,
      daysInMilk: null,
    });
  });
});

describe("what a set of records sent somewhere", () => {
  const records = [
    { liters: "12.50", destination: "bulk" },
    { liters: 7.25, destination: "bulk" },
    { liters: "3.00", destination: "calves" },
    { liters: "1.75", destination: "discard" },
  ];

  it("adds up only the ones that went there", () => {
    expect(litersTo("bulk", records)).toBe(19.75);
    expect(litersTo("calves", records)).toBe(3);
    expect(litersTo("discard", records)).toBe(1.75);
  });

  it("reads the column's own strings as the figures they are", () => {
    // The liters column comes back as a string, and a sum that concatenated them would be silent.
    expect(litersTo("bulk", [{ liters: "12.50", destination: "bulk" }])).toBe(
      12.5
    );
  });

  it("is nought where nothing went", () => {
    expect(litersTo("bulk", [])).toBe(0);
  });
});

/** A morning milking at 05:30 farm time, which is 23:30 the day before by the clock. */
const morning = (day: string, liters: number) => ({
  at: new Date(`2032-06-${day}T23:30:00.000Z`),
  liters,
});

describe("a cow giving less", () => {
  const NOW = new Date("2032-06-10T00:00:00.000Z");
  const farm = { milkDropPercent: 20, milkDropDays: 2 };
  /** Her milkings twice a day for `days` days before now, each giving what `liters` says for that day back. */
  const milkings = (days: number, liters: (daysBack: number) => number) =>
    Array.from({ length: days * 2 }, (_, index) => {
      const daysBack = Math.floor(index / 2) + 1;
      return {
        at: new Date(
          NOW.getTime() - daysBack * 86_400_000 + (index % 2) * 43_200_000
        ),
        liters: liters(daysBack),
      };
    });

  it("names a cow whose last two days fall a fifth under the week before", () => {
    const records = milkings(9, (daysBack) => (daysBack <= 2 ? 3.8 : 5));
    expect(milkDropOf(records, NOW, farm)).toEqual({
      lately: 3.8,
      usually: 5,
      dropPercent: 24,
    });
  });

  it("does not name a cow slowly drying off as her lactation goes on", () => {
    // A tenth of a liter less each day: late lactation, not illness.
    const records = milkings(9, (daysBack) => 4 + daysBack * 0.1);
    expect(milkDropOf(records, NOW, farm)).toBeNull();
  });

  it("does not read a milking nobody recorded as a milking of nothing", () => {
    const records = milkings(9, () => 5).filter(
      (_, index) => index !== 0 && index !== 2
    );
    expect(milkDropOf(records, NOW, farm)).toBeNull();
  });

  it("reads a milking by the farm day it was milked on, not the clock's", () => {
    // 05:30 farm time is 23:30 the day before by the clock: a milking stamped the 7th is the 8th's, one of the last two
    // farm days before the 10th.
    const records = [
      ...["01", "02", "03", "04", "05", "06"].map((day) => morning(day, 10)),
      morning("07", 6),
      morning("08", 6),
    ];
    expect(milkDropOf(records, NOW, farm)).toMatchObject({
      lately: 6,
      usually: 10,
    });
  });

  it("says nothing without milkings in both parts", () => {
    expect(
      milkDropOf(
        milkings(2, () => 1),
        NOW,
        farm
      )
    ).toBeNull();
  });
});

/** An hour of a day in July 2032, by the clock. */
const inJuly = (day: number, hour: number) =>
  new Date(Date.UTC(2032, 6, day, hour));

describe("the week's milk, accounted for", () => {
  const WEEK_FROM = inJuly(1, 0);
  const NOW = inJuly(8, 0);
  /** Milked at six and at five, a hundred liters each, from the last day of June to the 7th. */
  const sessions = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((day) => [
    { at: inJuly(day, 6), toBulk: 100 },
    { at: inJuly(day, 17), toBulk: 100 },
  ]);
  /** Collected each morning at eight: last evening's and this morning's. */
  const collected = (liters: (day: number) => number) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((day) => ({
      at: inJuly(day, 8),
      liters: liters(day),
    }));

  it("nets an evening's milk collected the next morning to nothing", () => {
    const account = milkAccountOf(
      sessions,
      collected(() => 200),
      WEEK_FROM,
      NOW
    );
    expect(account).toMatchObject({
      carriedIn: 100,
      stillInTank: 100,
      notAccounted: 0,
      notAccountedPercent: 0,
    });
  });

  it("names what went in and never left, nor is in the tank", () => {
    const account = milkAccountOf(
      sessions,
      collected((day) => (day >= 1 ? 180 : 200)),
      WEEK_FROM,
      NOW
    );
    // Twenty liters short on each of the seven mornings in the week.
    expect(account.notAccounted).toBe(140);
    // 140 of 1,500 is 9.33%: past a 9% line, which a whole percent would round back onto and never tell.
    expect(account.notAccountedPercent).toBe(9.33);
  });

  it("counts a day nobody collected as still in the tank", () => {
    const skipped = collected(() => 200).filter((one) => one.at < inJuly(6, 0));
    const account = milkAccountOf(sessions, skipped, WEEK_FROM, NOW);
    expect(account.notAccounted).toBe(0);
    expect(account.stillInTank).toBe(500);
  });

  it("shows more out than the records put in, as below nothing", () => {
    const account = milkAccountOf(
      sessions,
      collected(() => 210),
      WEEK_FROM,
      NOW
    );
    expect(account.notAccounted).toBeLessThan(0);
  });
});

describe("one cow's Lactation", () => {
  // Dhaka is six hours ahead: 23:00 UTC on the 1st is the farm's 2nd.

  it("adds each farm day's milkings, whatever Destination they went to, and reads her best day and her week", () => {
    const summary = lactationSummary([
      { liters: "6", recordedAt: new Date("2026-03-01T00:00:00Z") },
      { liters: "4", recordedAt: new Date("2026-03-01T10:00:00Z") },
      { liters: 7, recordedAt: new Date("2026-03-01T23:00:00Z") },
      { liters: "5.5", recordedAt: new Date("2026-03-02T10:00:00Z") },
      { liters: "8", recordedAt: new Date("2026-03-03T00:00:00Z") },
    ]);
    // The 1st gave 10; the farm's 2nd, 7 and 5.5; the 3rd, 8.
    expect(summary).toEqual({
      liters: 30.5,
      daysMilked: 3,
      perDay: 10.2,
      peak: { day: "2026-03-02", liters: 12.5 },
      latelyPerDay: 10.2,
    });
  });

  it("says nothing of a cow never milked in it", () => {
    expect(lactationSummary([])).toEqual({
      liters: 0,
      daysMilked: 0,
      perDay: null,
      peak: null,
      latelyPerDay: null,
    });
  });
});

/** One cow's Bulk liters at one milking, on the Dairy side. */
const share = (animalId: string, instant: string, liters: number) => ({
  animalId,
  side: "dairy",
  at: new Date(instant),
  liters,
});

describe("liters to Bulk for each cow milked, a day", () => {
  it("is the stretch's liters over the cow-days they came from, morning and evening one day", () => {
    const stretch = {
      from: new Date("2026-03-01T00:00:00+06:00"),
      until: new Date("2026-03-03T00:00:00+06:00"),
    };
    expect(
      litersPerCowMilked(
        [
          // Asha, both milkings of the 1st and of the 2nd; Bela only the 1st: three cow-days, 36 liters.
          share("asha", "2026-03-01T05:30:00+06:00", 7),
          share("asha", "2026-03-01T16:30:00+06:00", 5),
          share("bela", "2026-03-01T05:30:00+06:00", 6),
          share("asha", "2026-03-02T05:30:00+06:00", 8),
          share("asha", "2026-03-02T16:30:00+06:00", 10),
          // Outside the stretch, and a fattening animal's: neither counts.
          share("asha", "2026-03-03T05:30:00+06:00", 50),
          {
            ...share("chandra", "2026-03-01T05:30:00+06:00", 50),
            side: "fattening",
          },
        ],
        stretch
      )
    ).toBe(12);
  });

  it("says nothing of a stretch nobody milked in", () => {
    expect(
      litersPerCowMilked([], { from: new Date(0), until: new Date(1) })
    ).toBeNull();
  });
});

describe("what the calves drank a day", () => {
  it("is read over the week's whole days, not spread over a morning not yet over", () => {
    const startOfToday = new Date("2031-07-10T18:00:00.000Z");
    const hour = 60 * 60 * 1000;
    // Ten liters a feed, morning and evening, for nine days; today only the morning's.
    const feeds = Array.from({ length: 9 }, (_, back) => back).flatMap(
      (back) => {
        const dayBegan = startOfToday.getTime() - (back + 1) * 24 * hour;
        return [
          { at: new Date(dayBegan + 6 * hour), toCalves: 10 },
          { at: new Date(dayBegan + 17 * hour), toCalves: 10 },
        ];
      }
    );
    feeds.push({
      at: new Date(startOfToday.getTime() + 6 * hour),
      toCalves: 10,
    });
    expect(calvesDrankADay(feeds, startOfToday)).toBe(20);
  });
});
