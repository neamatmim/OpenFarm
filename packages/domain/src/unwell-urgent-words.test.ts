import { translate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { noticeFilling } from "./notice-words";
import { SAYS, wakesTheFarm } from "./notify";
import { URGENT_ROUND_WORDS, URGENT_SIGHT_WORDS } from "./standard-playbook";

// The notice of urgent work about an unwell animal names what was seen in the reader's language. The Observation keeps
// only the Bangla, so the English comes from the farm's own words for each urgent sighting — the same table the round's
// and the after-calving check's choices are drawn from.

const FACTS = {
  sopBn: "জরুরি: অসুস্থ পশু দেখুন",
  sopEn: "Urgent: see to an unwell animal",
  pen: "শেড ১ / পেন ২",
  dueAt: "2061-05-02T02:30:00.000Z",
  tag: "BD-0042",
  saw: "bloat",
  sawBn: "পেট ফাঁপা",
};

describe("the urgent sighting's notice", () => {
  it("has words for every urgent sighting, in both languages", () => {
    for (const word of URGENT_ROUND_WORDS) {
      expect(URGENT_SIGHT_WORDS[word]?.bn, word).toBeTruthy();
      expect(URGENT_SIGHT_WORDS[word]?.en, word).toBeTruthy();
    }
  });

  it("says what was seen in English to an English reader, and in Bangla to a Bangla one", () => {
    const english = translate(
      "en",
      SAYS.unwell_urgent.app,
      noticeFilling("unwell_urgent", FACTS, "en")
    );
    expect(english).toContain("Bloated");
    expect(english).toContain("BD-0042");
    expect(english).not.toContain("পেট ফাঁপা");
    const bangla = translate(
      "bn",
      SAYS.unwell_urgent.app,
      noticeFilling("unwell_urgent", FACTS, "bn")
    );
    expect(bangla).toContain("পেট ফাঁপা");
  });

  it("says the Bangla the Observation kept for a word the farm has no English for", () => {
    const english = translate(
      "en",
      SAYS.unwell_urgent.app,
      noticeFilling(
        "unwell_urgent",
        { ...FACTS, saw: "something_new", sawBn: "নতুন কিছু" },
        "en"
      )
    );
    expect(english).toContain("নতুন কিছু");
  });

  it("wakes the farm, and goes to a pocket", () => {
    expect(wakesTheFarm("unwell_urgent")).toBe(true);
    expect(SAYS.unwell_urgent.push).toBeDefined();
  });
});
