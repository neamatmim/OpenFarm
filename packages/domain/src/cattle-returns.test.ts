import { describe, expect, it } from "vitest";

import type { ReturnBooks } from "./cattle-returns";
import {
  capitalOf,
  seasonsOf,
  ventureReturnOf,
  whatHappenedTo,
} from "./cattle-returns";
import { startOfFarmDay } from "./farm-clock";
import type { Charge } from "./holding";
import { howSheLeft } from "./holding";

// The Farm's own bulls fed for Eid-ul-Adha 2031, and Venture v1's. All bought on 4 January 2031.
const WINDOW = {
  targetWindowStart: "2031-05-27",
  targetWindowEnd: "2031-05-29",
};
const bought = new Date("2031-01-04T05:00:00.000Z");
const today = new Date("2031-06-10T06:00:00.000Z");

const feed = (animalId: string, at: string, bdt: number): Charge => ({
  kind: "feed",
  animalId,
  side: "fattening",
  at: new Date(at),
  bdt,
  fromId: "ভুসি",
  unpricedKg: 0,
  priced: true,
});

/** Books with nobody in them but what a test adds. */
const books = (more: Partial<ReturnBooks> = {}): ReturnBooks => ({
  charges: new Map(),
  animals: [],
  ownedThenBy: () => null,
  intakes: [],
  joinings: [],
  internal: [],
  died: new Map(),
  lost: new Map(),
  values: new Map(),
  bankRates: [],
  ...more,
});

const intake = (animalId: string, purchasePriceBdt: number) => ({
  id: `in-${animalId}`,
  animalId,
  purchasePriceBdt,
  arrivedAt: bought,
  ...WINDOW,
});

const animal = (
  id: string,
  sale: { soldAt: string; priceBdt: number } | null = null
) => ({
  id,
  tagNumber: id,
  sale: sale
    ? { soldAt: new Date(sale.soldAt), priceBdt: sale.priceBdt }
    : null,
});

describe("a Season of the Farm's own", () => {
  it("is a result once its last bull has gone, the dead in with nothing back", () => {
    const [season] = seasonsOf(
      books({
        intakes: [intake("১", 80_000), intake("২", 80_000)],
        animals: [
          animal("১", {
            soldAt: "2031-05-20T05:00:00.000Z",
            priceBdt: 110_000,
          }),
          animal("২"),
        ],
        died: new Map([["২", new Date("2031-03-01T05:00:00.000Z")]]),
        charges: new Map([
          ["১", [feed("১", "2031-02-01T02:00:00.000Z", 10_000)]],
          ["২", [feed("২", "2031-02-01T02:00:00.000Z", 5000)]],
        ]),
      }),
      60,
      today
    );
    expect(season).toMatchObject({ finished: true, head: 2, died: 1 });
    // ৳1,75,000 in — two bulls and their feed — and ৳1,10,000 back: a loss, said as one.
    expect(season?.returnOnCost).toMatchObject({
      costBdt: 175_000,
      backBdt: 110_000,
      resultBdt: -65_000,
    });
    expect(season?.returnOnCost?.perYear).toBeLessThan(0);
  });

  it("values the standing it can and names, whole, the one it cannot", () => {
    // ৩ is priced today at ৳95,000–1,05,000; ৪ has never been weighed. ৪'s cost is in no figure, and she is named.
    const [season] = seasonsOf(
      books({
        intakes: [intake("৩", 80_000), intake("৪", 70_000)],
        animals: [animal("৩"), animal("৪")],
        charges: new Map([
          ["৪", [feed("৪", "2031-02-01T02:00:00.000Z", 9000)]],
        ]),
        values: new Map<
          string,
          | { lowBdt: number; highBdt: number }
          | { tagNumber: string; why: "no_weight" }
        >([
          ["৩", { lowBdt: 95_000, highBdt: 105_000 }],
          ["৪", { tagNumber: "৪", why: "no_weight" }],
        ]),
      }),
      60,
      today
    );
    expect(season?.finished).toBe(false);
    expect(season?.running).toMatchObject({
      standingCostBdt: 80_000,
      standingLowBdt: 95_000,
      standingHighBdt: 105_000,
    });
    expect(season?.gaps).toEqual([{ tagNumber: "৪", why: "no_weight" }]);
  });
});

describe("a Venture's cattle", () => {
  it("say how far they now stand from the Settlement a cost came after", () => {
    const venture = {
      id: "v1",
      name: "ভেঞ্চার",
      window: { start: WINDOW.targetWindowStart, end: WINDOW.targetWindowEnd },
    };
    const theirs = books({
      ownedThenBy: () => "v1",
      intakes: [intake("৫", 100_000)],
      animals: [
        animal("৫", { soldAt: "2031-05-20T05:00:00.000Z", priceBdt: 120_000 }),
      ],
      charges: new Map([["৫", [feed("৫", "2031-02-01T02:00:00.000Z", 6000)]]]),
    });
    const settlement = {
      profitBdt: 14_000,
      farmBdt: 5600,
      shares: [],
      movements: [],
    };
    expect(
      ventureReturnOf(theirs, venture, settlement, 60, today).sinceSettlementBdt
    ).toBeNull();
    // A Vet's fee of ৳1,200 for a visit in February, entered after the Settlement.
    const later = books({
      ...theirs,
      charges: new Map([
        [
          "৫",
          [
            feed("৫", "2031-02-01T02:00:00.000Z", 6000),
            {
              ...feed("৫", "2031-02-10T00:00:00.000Z", 1200),
              kind: "vet" as const,
            },
          ],
        ],
      ]),
    });
    expect(
      ventureReturnOf(later, venture, settlement, 60, today).sinceSettlementBdt
    ).toBe(-1200);
    expect(ventureReturnOf(later, venture, null, 60, today)).toMatchObject({
      settled: false,
      sinceSettlementBdt: null,
      returnOnCost: { resultBdt: 12_800 },
    });
  });
});

describe("the Investors' capital", () => {
  it("is what came in on their Agreements, never the Owner's Advance", () => {
    const capital = capitalOf(
      [{ agreementId: "a1", paidMovementId: "pay" }],
      [
        {
          id: "c",
          kind: "capital_in",
          agreementId: "a1",
          amountBdt: 500_000,
          movedOn: "2031-01-02",
        },
        {
          id: "adv",
          kind: "advance",
          agreementId: null,
          amountBdt: 60_000,
          movedOn: "2031-02-02",
        },
        {
          id: "pay",
          kind: "payout",
          agreementId: "a1",
          amountBdt: 540_000,
          movedOn: "2031-06-02",
        },
      ]
    );
    expect(capital).toEqual([
      {
        bdt: 500_000,
        arrived: startOfFarmDay("2031-01-02"),
        paidBack: startOfFarmDay("2031-06-02"),
      },
    ]);
  });
});

describe("how a Holding ended", () => {
  const holding = {
    animalId: "৬",
    owner: null,
    side: "fattening" as const,
    from: bought,
  };
  const nothing = {
    sale: null,
    internalSales: [],
    crossing: null,
    died: null,
    lost: null,
  };

  it("is nothing while she is still the owner's", () => {
    expect(howSheLeft(holding, nothing, () => null)).toBeNull();
  });

  it("is her Sale only while she was this owner's", () => {
    const sold = {
      ...nothing,
      sale: { soldAt: new Date("2031-05-01T05:00:00.000Z"), priceBdt: 99_000 },
    };
    expect(howSheLeft(holding, sold, () => null)).toMatchObject({
      how: "sold",
      backBdt: 99_000,
    });
    expect(howSheLeft(holding, sold, () => "v1")).toBeNull();
  });

  it("is an Internal Sale away on the start of its day, never before she came", () => {
    const sameDay = startOfFarmDay("2031-01-04");
    const away = {
      ...nothing,
      internalSales: [
        {
          id: "i1",
          fromVentureId: null,
          priceBdt: 90_000,
          createdAt: new Date("2031-01-04T09:00:00.000Z"),
          on: sameDay,
        },
      ],
    };
    // Bought at five and sold on to a Venture the same day: she left when she came, not the midnight before.
    expect(howSheLeft(holding, away, () => null)).toMatchObject({
      how: "sold_to_venture",
      on: bought,
      backBdt: 90_000,
    });
  });

  it("is her crossing, for a Dairy Holding — priced or not yet", () => {
    const crossed = {
      ...nothing,
      crossing: { on: new Date("2031-03-01T05:00:00.000Z"), priceBdt: null },
    };
    expect(
      howSheLeft({ ...holding, side: "dairy" }, crossed, () => null)
    ).toMatchObject({ how: "crossed", backBdt: null });
    // A crossing is no end of a Fattening Holding: that is where she went.
    expect(howSheLeft(holding, crossed, () => null)).toBeNull();
  });

  it("is her death, with nothing back", () => {
    const dead = { ...nothing, died: new Date("2031-03-01T05:00:00.000Z") };
    expect(howSheLeft(holding, dead, () => null)).toMatchObject({
      how: "died",
      backBdt: 0,
    });
  });

  it("is her being written off as Lost, with nothing back", () => {
    const gone = { ...nothing, lost: new Date("2031-03-01T05:00:00.000Z") };
    expect(howSheLeft(holding, gone, () => null)).toMatchObject({
      how: "lost",
      backBdt: 0,
    });
  });

  it("is read from the Books as they stand", () => {
    const read = whatHappenedTo(
      books({
        animals: [
          animal("৭", { soldAt: "2031-05-01T05:00:00.000Z", priceBdt: 1 }),
        ],
        joinings: [
          {
            id: "j",
            animalId: "৭",
            joinedAt: bought,
            how: "crossed",
            priceBdt: 40_000,
            internalSaleId: null,
            ...WINDOW,
          },
        ],
      }),
      "৭"
    );
    expect(read.crossing).toEqual({ on: bought, priceBdt: 40_000 });
    expect(read.sale?.priceBdt).toBe(1);
  });
});
