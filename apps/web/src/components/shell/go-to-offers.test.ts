import { describe, expect, it } from "vitest";

import { offeredFor } from "./go-to-offers";
import { navFor } from "./navigation";

const TAGS = ["D-0012", "D-0120", "F-0007"];

/** A catalog that says each destination by its key's last word, so a test reads what was offered. */
const said = (key: string) =>
  ({
    "nav.money": "Income and expenses",
    "nav.months": "Monthly report",
    "nav.milk": "Milk",
    "nav.animals": "Animals",
    "nav.today": "Today's work",
  })[key] ?? key;

const offered = (roles: Parameters<typeof navFor>[0], typed: string) =>
  offeredFor({ places: navFor(roles), say: said, tags: TAGS, typed }).map(
    (one) => (one.kind === "place" ? `page ${one.to}` : `animal ${one.tag}`)
  );

describe("the box that goes anywhere", () => {
  it("finds the reader's own pages by the words the menu says them in", () => {
    expect(offered(["owner"], "monthly")).toContain("page /monthly-report");
    expect(offered(["owner"], "income")).toContain("page /money");
  });

  it("never offers a page the reader's Roles do not hold", () => {
    expect(offered(["staff"], "monthly")).toEqual([]);
  });

  it("leads with the animal when a number is typed, and with the page when words are", () => {
    expect(offered(["owner"], "12")[0]).toBe("animal D-0012");
    expect(offered(["owner"], "milk")[0]).toBe("page /milk");
  });

  it("offers nothing for nothing typed", () => {
    expect(offered(["owner"], "  ")).toEqual([]);
  });
});
