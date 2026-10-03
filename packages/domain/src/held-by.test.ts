import { describe, expect, it } from "vitest";

import { heldFromThem } from "./held-by";

const SAKINA = { id: "sakina", name: "সাকিনা" };
const STAFF = { id: "rahim", roles: ["staff"] };
const MANAGER = { id: "karim", roles: ["manager"] };

describe("work held from somebody", () => {
  it("is held by whoever else claimed it", () => {
    expect(heldFromThem(SAKINA, STAFF, "in_progress")).toBe(SAKINA);
    expect(heldFromThem(SAKINA, MANAGER, "in_progress")).toBe(SAKINA);
  });

  it("is never held from the one who holds it, nor when nobody does", () => {
    expect(
      heldFromThem(SAKINA, { id: "sakina", roles: ["staff"] }, "in_progress")
    ).toBeNull();
    expect(heldFromThem(null, STAFF, "in_progress")).toBeNull();
  });

  it("is held from nobody who runs the farm once it is finished, but still from Staff", () => {
    expect(heldFromThem(SAKINA, MANAGER, "completed")).toBeNull();
    expect(heldFromThem(SAKINA, STAFF, "completed")).toBe(SAKINA);
  });
});
