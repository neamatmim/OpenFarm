import { describe, expect, it } from "vitest";

import {
  GIVING_LESS,
  OBSERVATION_WORDS,
  observationWordsFor,
} from "./observation-words";

const offered = (state: string) =>
  observationWordsFor(state).map((word) => word.value);

describe("what may be reported seeing of an animal", () => {
  it("offers 'giving less milk' of a cow in milk", () => {
    expect(offered("milking")).toContain(GIVING_LESS);
  });

  it("never offers it of an animal that gives no milk, and offers her everything else", () => {
    for (const state of ["dry", "heifer", "calf", "fattening", "quarantine"]) {
      expect(offered(state)).not.toContain(GIVING_LESS);
      expect(offered(state)).toHaveLength(OBSERVATION_WORDS.length - 1);
    }
  });
});
