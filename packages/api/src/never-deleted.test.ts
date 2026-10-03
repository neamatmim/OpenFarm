import { eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { venture } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// Farm records are never removed (the audit guard forbids a delete in any router). A stray delete — a restore script,
// a store written tomorrow — is refused by the database itself rather than taking a Venture's money or an animal's
// records with it.

const suffix = `never-deleted-${Date.now()}`;

/** Why the database refused, where it did: 23503 is a row other rows still point at. */
const refusedCode = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    const code =
      (error as { cause?: { code?: string } }).cause?.code ??
      (error as { code?: string }).code;
    return code ?? "refused";
  }
  return "deleted";
};

describe("a ledger row's parent, deleted", () => {
  it("is refused for a Venture its own plan still names", async () => {
    const { client } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2092-02-01T04:00:00.000Z"),
    });
    const opened = await client.ventures.open({
      name: `ভেঞ্চার ${suffix}`,
      targetCapitalMoney: 1_000_000,
      floorMoney: 0,
      decideBy: "2092-02-20",
      targetWindowStart: "2092-06-01",
      targetWindowEnd: "2092-06-05",
      unitPriceMoney: 50_000,
      units: 20,
      cattleBudgetMoney: 800_000,
    });
    // A plan and nothing more: before, deleting the Venture took its plan with it, unasked.
    await client.ventures.setPlan({
      ventureId: opened.id,
      lines: [
        {
          animals: 10,
          fromKg: 200,
          toKg: 250,
          buyMoneyPerKg: 500,
          dailyGainKg: 0.8,
        },
      ],
      saleLowMoneyPerKg: 550,
      saleHighMoneyPerKg: 600,
    });
    expect(
      await refusedCode(
        scratchDb().delete(venture).where(eq(venture.id, opened.id))
      )
    ).toBe("23503");
  });

  it("is refused for an animal her records still name", async () => {
    const { client } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2092-02-01T04:00:00.000Z"),
    });
    const shed = await client.herd.createShed({ name: suffix });
    const pen = await client.herd.createPen({
      shedId: shed.id,
      name: `পেন ${suffix}`,
    });
    const her = await client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    const row = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: her.tagNumber },
      columns: { id: true },
    });
    expect(
      await refusedCode(
        scratchDb()
          .delete(animal)
          .where(eq(animal.id, row?.id ?? ""))
      )
    ).toBe("23503");
  });
});
