import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The standard health list gives no disease the farm already lists under another of its names: "ক্ষুরা রোগ" beside the
// farm's own "খুরা রোগ" was one disease twice on the Vet's list.

describe("the standard notifiable diseases", () => {
  it("leave out a disease the farm already lists by one of its other names", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
    });
    await owner.notifiableDiseases.create({ name: { bn: "খুরা রোগ" } });

    await owner.farm.startWithStandard({ kinds: ["health"] });

    const listed = await owner.notifiableDiseases.list();
    const footAndMouth = listed.filter((one) =>
      ["খুরা রোগ", "ক্ষুরা রোগ"].includes(one.nameBn)
    );
    expect(footAndMouth.map((one) => one.nameBn)).toEqual(["খুরা রোগ"]);
    // The rest of the standard list is given as before.
    expect(listed.some((one) => one.nameBn === "তড়কা")).toBe(true);
  });
});
