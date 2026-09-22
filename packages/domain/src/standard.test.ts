import { describe, expect, it } from "vitest";

import { findRationProblems } from "./feed";
import { findPublishBlockers } from "./sop";
import {
  STANDARD_DRUGS,
  STANDARD_FEED_ITEMS,
  STANDARD_NOTIFIABLE_DISEASES,
  STANDARD_RATIONS,
} from "./standard";
import type { PlaybookKey } from "./standard-playbook";
import { STANDARD_SOP_NEEDS, standardPlaybook } from "./standard-playbook";

const NAMED = {
  calvingPen: "pen-calving",
  fmdVaccine: "product-fmd",
  lsdVaccine: "product-lsd",
  dewormer: "product-dewormer",
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

describe("the standard lists", () => {
  it("has Rations the farm could save by hand", () => {
    for (const one of Object.values(STANDARD_RATIONS)) {
      const problems = findRationProblems({
        name: one.name,
        items: one.items.map(([key, kg]) => ({
          feedItemId: key,
          kgPerAnimalPerDay: kg,
        })),
      });
      expect({ ration: one.name.en, problems }).toEqual({
        ration: one.name.en,
        problems: [],
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
