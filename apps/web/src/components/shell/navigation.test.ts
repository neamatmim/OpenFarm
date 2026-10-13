import { describe, expect, it } from "vitest";

import { BOTTOM_BAR, barWithCounts, navFor } from "./navigation";

/** Every destination a person holding these Roles is offered, as "group › label → address". */
const offered = (roles: Parameters<typeof navFor>[0]) =>
  navFor(roles).flatMap((group) =>
    group.items.map((item) => `${group.label} › ${item.label} → ${item.to}`)
  );

describe("the trail in the menu", () => {
  it("is what a Barn Staff member recorded, with the day's work, never an audit log under Compliance", () => {
    expect(offered(["staff"])).toContain(
      "nav.group.today › nav.myRecords → /audit"
    );
    expect(
      offered(["staff"]).filter((one) => one.includes("nav.audit"))
    ).toEqual([]);
  });

  it("is the farm's audit log under Compliance for whoever runs the farm", () => {
    expect(offered(["manager"])).toContain(
      "nav.group.compliance › nav.audit → /audit"
    );
    expect(
      offered(["owner"]).filter((one) => one.includes("nav.myRecords"))
    ).toEqual([]);
  });
});

describe("the counts on the phone's bar", () => {
  it("says how much waits on the Manager's day and their checks, in their own digits, and nothing where none waits", () => {
    const bar = barWithCounts(
      BOTTOM_BAR.manager,
      { "/review-queue": 12, "/home": 0 },
      "bn"
    );

    expect(bar.map((item) => [item.to, item.count])).toEqual([
      ["/home", undefined],
      ["/review-queue", "১২"],
      ["/animals", undefined],
    ]);
  });

  it("puts the milker's work owed now on Today's work", () => {
    expect(
      barWithCounts(BOTTOM_BAR.staff, { "/work": 3 }, "en").map(
        (item) => item.count
      )
    ).toEqual(["3", undefined]);
  });
});
