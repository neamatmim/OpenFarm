import { describe, expect, it } from "vitest";

import { navFor } from "./navigation";

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
