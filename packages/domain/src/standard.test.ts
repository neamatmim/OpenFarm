import { describe, expect, it } from "vitest";

import type { WeightBand } from "./feed";
import { findBandProblems, findRationProblems } from "./feed";
import { findPublishBlockers } from "./sop";
import {
  STANDARD_DRUGS,
  STANDARD_FEED_ITEMS,
  STANDARD_NOTIFIABLE_DISEASES,
  STANDARD_RATIONS,
  rationLineOf,
} from "./standard";
import type { PlaybookKey } from "./standard-playbook";
import { STANDARD_SOP_NEEDS, standardPlaybook } from "./standard-playbook";

const NAMED = {
  calvingPen: "pen-calving",
  fmdVaccine: "product-fmd",
  lsdVaccine: "product-lsd",
  dewormer: "product-dewormer",
  flukeDrench: "product-fluke",
  hsVaccine: "product-hs",
  bqVaccine: "product-bq",
  anthraxVaccine: "product-anthrax",
  tickSpray: "product-spray",
} as const;

describe("the Standard Playbook", () => {
  it("has nothing stopping any of it once the farm has named its Pen and products", () => {
    for (const [key, content] of Object.entries(standardPlaybook(NAMED))) {
      expect({ key, blockers: findPublishBlockers(content) }).toEqual({
        key,
        blockers: [],
      });
    }
  });

  it("will not publish an SOP whose Pen or product the farm has not named, and says so", () => {
    const blank = standardPlaybook();
    for (const key of Object.keys(STANDARD_SOP_NEEDS) as PlaybookKey[]) {
      expect({
        key,
        blocked: findPublishBlockers(blank[key]).length > 0,
      }).toEqual({ key, blocked: true });
    }
  });

  it("asks nothing of the farm for the SOPs that name no Pen or product", () => {
    const blank = standardPlaybook();
    const asksNothing = (Object.keys(blank) as PlaybookKey[]).filter(
      (key) => !STANDARD_SOP_NEEDS[key]
    );
    for (const key of asksNothing) {
      expect({ key, blockers: findPublishBlockers(blank[key]) }).toEqual({
        key,
        blockers: [],
      });
    }
  });

  it("names each SOP once, so the Owner can tell which are already in the Playbook", () => {
    const names = Object.values(standardPlaybook()).map((sop) => sop.name.bn);
    expect(new Set(names).size).toBe(names.length);
  });
});

/** A band open at both ends: a Ration for any weight. */
const OPEN: WeightBand = { fromKg: null, toKg: null };

/** The fattening Rations, lightest first: the calf's, then the bull's by weight. */
const FATTENING_BY_WEIGHT = [
  "calf",
  "bullStarter",
  "bullGrower",
  "bullFinisher",
  "bullLateFinisher",
  "heavyBull",
] as const;

/** The heaviest Eid bull the farm plans for. */
const HEAVIEST_KG = 1000;

/** The most mustard cake an adult takes in a day (NDDB 2012). */
const MOST_CAKE_KG = 1.5;

describe("the standard lists", () => {
  it("has Rations the farm could save by hand", () => {
    for (const one of Object.values(STANDARD_RATIONS)) {
      const band: WeightBand = "band" in one ? one.band : OPEN;
      const problems = [
        ...findRationProblems({
          items: one.items.map((line) => rationLineOf(line, (key) => key)),
        }),
        ...findBandProblems(band),
      ];
      expect({ ration: one.name.en, problems }).toEqual({
        ration: one.name.en,
        problems: [],
      });
    }
  });

  // Calf to the heaviest Eid bull, one Ration's band ends where the next begins: no weight falls between two.
  it("feeds a fattening bull of any weight on exactly one Ration", () => {
    const bands = FATTENING_BY_WEIGHT.map((key) => STANDARD_RATIONS[key].band);
    expect(bands[0]?.fromKg).toBeNull();
    expect(bands.at(-1)?.toKg).toBeNull();
    for (const [index, band] of bands.slice(1).entries()) {
      expect(band.fromKg).toBe(bands[index]?.toKg);
    }
  });

  // NDDB 2012: an adult takes 1–1.5 kg of mustard cake a day, and no more.
  it("keeps mustard cake under a kilo and a half a day, whatever the bull weighs", () => {
    for (const key of FATTENING_BY_WEIGHT) {
      const ration = STANDARD_RATIONS[key];
      const heaviest = ration.band.toKg ?? HEAVIEST_KG;
      const cake = ration.items.find(([feed]) => feed === "mustardCake");
      const perDay =
        cake?.[2] === "per100kg"
          ? (cake[1] * heaviest) / 100
          : (cake?.[1] ?? 0);
      expect({ key, underTheMost: perDay <= MOST_CAKE_KG }).toEqual({
        key,
        underTheMost: true,
      });
    }
  });

  // A farm's names are unique, and a second of the same name would be dropped without a word.
  it("names everything once", () => {
    const lists = [
      Object.values(STANDARD_FEED_ITEMS),
      Object.values(STANDARD_RATIONS).map((one) => one.name),
      Object.values(STANDARD_DRUGS),
      STANDARD_NOTIFIABLE_DISEASES,
    ];
    for (const list of lists) {
      const names = list.map((one) => one.bn);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
