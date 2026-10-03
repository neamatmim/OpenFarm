import { scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { counterpartyNamed } from "./counterparty-store";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// The trader is recorded once per farm and found by his name as the Manager writes it — whatever letters she capitalised
// today. Two of him would split what he owes the farm between two names.

const suffix = `counterparty-${Date.now()}`;
const NOW = new Date("2093-04-01T04:00:00.000Z");

const named = (name: string) =>
  scratchDb().transaction((tx) =>
    counterpartyNamed(tx, theFarm().id, { name }, NOW)
  );

beforeAll(async () => {
  // This file's own Farm, as a client opens it.
  await createTestClient(appRouter, { as: "owner" });
});

describe("a trader found by his name", () => {
  it("is the same trader however his name is capitalised", async () => {
    const first = await named(`Karim Traders ${suffix}`);
    expect(await named(`karim traders ${suffix}`)).toBe(first);
    expect(await named(`KARIM TRADERS ${suffix}`)).toBe(first);
  });

  it("is one trader when two phones name him at once", async () => {
    const both = await Promise.all([
      named(`Rahim Beparies ${suffix}`),
      named(`Rahim Beparies ${suffix}`),
    ]);
    expect(both[0]).toBe(both[1]);
  });
});
