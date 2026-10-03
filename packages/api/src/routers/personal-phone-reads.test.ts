import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What a Venture's money comes to — its plan, its projected profit, what it returned — and the farm's own returns and
// cull list are the Owner's to read on her own phone, as the Venture list and the Audit Log are: never on a Shed
// Phone, which anybody may pick up after she has PIN-switched onto it.

const ON_THE_SHED_PHONE = { refusal: "personal_phone_only" };

describe("the Owner's money, read on a Shed Phone", () => {
  it("is refused, every read of it", async () => {
    const { client } = await createTestClient(appRouter, {
      as: "owner",
      onShedPhone: true,
    });
    const venture = { ventureId: "no-such-venture" };
    const reads: [string, Promise<unknown>][] = [
      ["ventures.plan", client.ventures.plan(venture)],
      [
        "ventures.planAgainstActual",
        client.ventures.planAgainstActual(venture),
      ],
      ["ventures.projection", client.ventures.projection(venture)],
      ["ventures.movableAnimals", client.ventures.movableAnimals()],
      ["returns.page", client.returns.page()],
      ["returns.runningSeasons", client.returns.runningSeasons()],
      [
        "returns.breakdown",
        client.returns.breakdown({ seasonKey: "2090", by: "breed" }),
      ],
      [
        "returns.forAnimal",
        client.returns.forAnimal({ animalId: "no-such-animal" }),
      ],
      ["returns.venture", client.returns.venture(venture)],
      ["cullList.list", client.cullList.list()],
    ];
    const said = await Promise.all(
      reads.map(async ([name, read]) => {
        try {
          await read;
          return [name, "answered"];
        } catch (error) {
          return [name, (error as { data?: { refusal?: string } }).data];
        }
      })
    );
    expect(Object.fromEntries(said)).toEqual(
      Object.fromEntries(reads.map(([name]) => [name, ON_THE_SHED_PHONE]))
    );
  });

  it("is still the Owner's to read on her own phone", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });
    await expect(client.cullList.list()).resolves.toBeDefined();
    await expect(client.returns.page()).resolves.toBeDefined();
  });
});
