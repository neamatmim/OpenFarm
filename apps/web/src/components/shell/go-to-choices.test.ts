import type { MessageKey } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { goToChoicesFor } from "./go-to-choices";
import { navFor } from "./navigation";

const TAGS = ["D-0012", "D-0120", "F-0007"];

/** A catalog of a few menu words — one of them with a number in it, so a page and an animal can both match — and the
 *  key itself for the rest. */
const said = (key: MessageKey) =>
  ({
    "nav.money": "Income and expenses",
    "nav.months": "Monthly report 2026",
    "nav.milk": "Milk",
    "nav.animals": "Animals",
    "nav.today": "Today's work",
  })[key as string] ?? key;

const shown = (roles: Parameters<typeof navFor>[0], typed: string) =>
  goToChoicesFor({ places: navFor(roles), say: said, tags: TAGS, typed }).map(
    (one) => (one.kind === "place" ? `page ${one.to}` : `animal ${one.tag}`)
  );

describe("the Go to box", () => {
  it("finds the reader's own pages by the words the menu says them in", () => {
    expect(shown(["owner"], "monthly")).toContain("page /monthly-report");
    expect(shown(["owner"], "income")).toContain("page /money");
  });

  it("never shows a page the reader's Roles do not hold", () => {
    expect(shown(["staff"], "monthly")).toEqual([]);
  });

  it("puts the animals first when what is typed reads as a tag, and the pages first when it reads as words", () => {
    expect(shown(["owner"], "20")).toEqual([
      "animal D-0120",
      "page /monthly-report",
    ]);
    expect(shown(["owner"], "milk")[0]).toBe("page /milk");
  });

  it("shows nothing for nothing typed", () => {
    expect(shown(["owner"], "  ")).toEqual([]);
  });
});
