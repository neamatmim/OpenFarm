import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { NomineeDraft } from "./nominee-draft";
import {
  EMPTY_DRAFT,
  draftsOf,
  draftsProblem,
  nomineesOf,
} from "./nominee-draft";

// The Nominees block's rows: what the Owner types, turned into the Nominees a paper names and checked by the domain's
// own rule, so the form warns of exactly what the farm would refuse.

const DAY = "2026-09-26";

const row = (some: Partial<NomineeDraft>): NomineeDraft => ({
  ...EMPTY_DRAFT,
  name: "রহিমা বেগম",
  relation: "wife",
  bornOn: "1982-03-14",
  share: "100",
  ...some,
});

describe("the Nominees the Owner writes down", () => {
  it("go to the paper with their relation as a Bangla word, and a Receiver only for a minor", () => {
    const [wife, daughter] = nomineesOf(
      [
        row({ share: "80", receiverName: "left behind" }),
        row({
          name: "সাদিয়া",
          relation: "daughter",
          bornOn: "2012-11-20",
          share: "20",
          receiverName: "রহিমা বেগম",
          receiverRelation: "mother",
        }),
      ],
      DAY
    );

    expect(wife).toMatchObject({ relation: "স্ত্রী", receiver: null });
    expect(daughter).toMatchObject({
      relation: "মেয়ে",
      receiver: { name: "রহিমা বেগম", relation: "মা", phone: null },
    });
  });

  it("are checked by the domain's rule: an empty share is not a share", () => {
    expect(draftsProblem([row({ share: "" })], DAY)).toEqual({
      code: "shares_not_whole",
      at: 1,
    });
    expect(draftsProblem([row({})], DAY)).toBeNull();
    expect(draftsProblem([], DAY)).toBeNull();
  });

  it("come back from the list in force as they were written, a carried-over one with no date of birth", () => {
    const [back] = draftsOf([
      {
        name: "রোকেয়া",
        relation: "খালা",
        phone: null,
        bornOn: null,
        sharePercent: 100,
        receiver: null,
      },
    ]);

    expect(back).toMatchObject({
      relation: "other",
      relationInWords: "খালা",
      bornOn: "",
      share: "100",
    });
  });

  it("are warned about by the domain's own function, never a second copy of the rule", () => {
    const source = readFileSync(
      fileURLToPath(new URL("nominee-draft.ts", import.meta.url)),
      "utf-8"
    );
    const form = readFileSync(
      fileURLToPath(new URL("nominees-form.tsx", import.meta.url)),
      "utf-8"
    );

    expect(source).toMatch(
      /import \{[^}]*nomineesProblem[^}]*\} from "@OpenFarm\/domain"/u
    );
    expect(form).toContain("draftsProblem");
    // The rule's own figures belong to the domain: the form neither sums shares to a hundred nor counts to three.
    expect(form).not.toMatch(/!== 100|=== 100|> 3|>= 3/u);
  });
});
