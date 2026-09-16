import { describe, expect, it } from "vitest";

import { DISEASE_HISTORY } from "./disease-history";
import type { DeathRow } from "./mortality";
import { MORTALITY_REGISTER } from "./mortality";
import { MOVEMENT_LOG } from "./movement-log";
import type { Register } from "./register";
import { csvOf, hasCsv, paperOf, periodCovered, sayingIn } from "./register";
import { TREATMENT_REGISTER } from "./treatment";
import { VACCINATION_REGISTER } from "./vaccination";

const FARM = {
  name: "সাভার ডেইরি",
  address: null,
  phone: null,
  registrationNumber: "DLS/SAV/2026/০৪২",
  registrationOffice: null,
  registrationIssuedOn: null,
  registrationExpiresOn: null,
};

const produced = {
  farm: FARM,
  by: "ম্যানেজার",
  at: "১ মার্চ, ২০৪৬ ১০:০০",
};

const aDeath = (death: Partial<DeathRow> = {}): DeathRow => ({
  id: "m1",
  tagNumber: "BD-0001",
  diedOn: "2046-02-07",
  kind: "died",
  cause: "তড়কা",
  disposal: "burned",
  disposalNote: "খামারের পেছনে",
  reportReference: "ULO/2046/০১২",
  ...death,
});

/** A register of two columns, to say what the bench does with any declaration rather than what the mortality
 *  register happens to say. Its name is borrowed — every Register has one and nothing here reads it. */
const LEDGER: Register<{ what: string; note: string | null }> = {
  name: "movement_log",
  looksBack: { months: 0, days: -1 },
  read: () => Promise.resolve([]),
  paper: {
    title: { bn: "খাতা", en: "Ledger" },
    none: { bn: "কিছু নেই", en: "Nothing here" },
    heading: (row) => row.what,
  },
  columns: [
    { csv: { header: "what", value: (row) => row.what } },
    {
      paper: { bn: "টীকা", en: "Note", said: (row) => row.note },
      csv: { header: "note", value: (row) => row.note },
    },
  ],
  kept: (rows) => ({ lines: rows.length }),
};

describe("a register's period", () => {
  it("looks back its own way when nobody names a first day, and ends today", () => {
    const now = new Date("2046-03-01T04:00:00.000Z");

    expect(periodCovered(MORTALITY_REGISTER, {}, now)).toMatchObject({
      from: "2045-03-02",
      to: "2046-03-01",
    });
    expect(periodCovered(TREATMENT_REGISTER, {}, now)).toMatchObject({
      from: "2046-01-31",
      to: "2046-03-01",
    });
    expect(periodCovered(DISEASE_HISTORY, {}, now)).toMatchObject({
      from: "2045-09-02",
      to: "2046-03-01",
    });
  });

  it("keeps the days it was asked for, and refuses a period that runs backwards", () => {
    const now = new Date("2046-03-01T04:00:00.000Z");

    expect(
      periodCovered(
        VACCINATION_REGISTER,
        { from: "2046-02-01", to: "2046-02-28" },
        now
      )
    ).toMatchObject({ from: "2046-02-01", to: "2046-02-28" });
    expect(() =>
      periodCovered(
        VACCINATION_REGISTER,
        { from: "2046-02-28", to: "2046-02-01" },
        now
      )
    ).toThrow();
  });
});

describe("a register as a paper", () => {
  const saying = sayingIn("en");

  it("heads each row and leaves out the lines that row has nothing for", () => {
    const paper = paperOf(
      LEDGER,
      [
        { what: "one", note: "said" },
        { what: "two", note: null },
      ],
      { from: "2046-02-01", to: "2046-02-28" },
      produced,
      saying
    );

    expect(paper).toContain("one\n  টীকা / Note: said\ntwo\n");
    expect(paper).not.toContain("two\n  টীকা");
  });

  it("says so in both languages when the period holds nothing", () => {
    expect(
      paperOf(
        LEDGER,
        [],
        { from: "2046-02-01", to: "2046-02-28" },
        produced,
        saying
      )
    ).toContain("কিছু নেই / Nothing here");
  });

  it("writes the mortality register as the report set has it", () => {
    const paper = paperOf(
      MORTALITY_REGISTER,
      [
        aDeath(),
        aDeath({
          id: "m2",
          tagNumber: "BD-0002",
          cause: "stillbirth",
          disposal: null,
          disposalNote: null,
          reportReference: null,
        }),
      ],
      { from: "2046-02-01", to: "2046-02-28" },
      produced,
      saying
    );

    expect(paper).toBe(
      [
        "খামার: সাভার ডেইরি",
        "নিবন্ধন নম্বর: DLS/SAV/2026/০৪২",
        "",
        "মৃত্যুর রেজিস্টার / Mortality register",
        "সময়কাল / Period: 1 February 2046 — 28 February 2046",
        "",
        "BD-0001",
        "  তারিখ / Date: 7 February 2046",
        "  কারণ / Cause: তড়কা",
        "  নিষ্পত্তি / Disposal: পোড়ানো হয়েছে / Burned — খামারের পেছনে",
        "  ডিএলএস রেফারেন্স / DLS reference: ULO/2046/০১২",
        "BD-0002",
        "  তারিখ / Date: 7 February 2046",
        "  কারণ / Cause: মৃত জন্ম / Stillbirth",
        "  নিষ্পত্তি / Disposal: অপেক্ষমাণ / Awaiting",
        "",
        "১ মার্চ, ২০৪৬ ১০:০০ · ম্যানেজার",
      ].join("\n")
    );
  });

  it("leaves the DLS line out for a death with no reference, blank or missing", () => {
    const written = (reportReference: string | null) =>
      paperOf(
        MORTALITY_REGISTER,
        [aDeath({ reportReference })],
        { from: "2046-02-01", to: "2046-02-28" },
        produced,
        saying
      );

    expect(written(null)).not.toContain("DLS reference");
    expect(written("")).not.toContain("DLS reference");
    expect(written("ULO/2046/০১২")).toContain("DLS reference: ULO/2046/০১২");
  });
});

describe("a register as a CSV", () => {
  it("takes the columns a spreadsheet holds, in their own order", () => {
    const sheet = csvOf(MORTALITY_REGISTER, [aDeath()]);

    expect(sheet.slice(1).trim().split("\r\n")).toEqual([
      "tag,date,kind,cause,disposal,disposal_note,dls_reference",
      "BD-0001,2046-02-07,died,তড়কা,burned,খামারের পেছনে,ULO/2046/০১২",
    ]);
  });

  it("is refused to a register whose columns are all the paper's", () => {
    expect(hasCsv(DISEASE_HISTORY)).toBe(false);
    expect(hasCsv(MORTALITY_REGISTER)).toBe(true);
    expect(hasCsv(MOVEMENT_LOG)).toBe(true);
  });
});
