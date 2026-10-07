import type { farm } from "@OpenFarm/db/schema/farm";
import type { FarmParameter } from "@OpenFarm/domain";
import {
  ALL_FARM_PARAMETERS,
  FARM_PARAMETERS,
  parametersOwnersAlone,
} from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Every Farm Parameter, read from the one place each is declared: its bounds held, the Owner's kept the Owner's, and
// the trail's "before" carrying what it was. A Parameter added to the declaration is tested here with nothing more.

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock("2088-03-10T04:00:00.000Z"),
  });

const NUMBERS = Object.keys(FARM_PARAMETERS) as FarmParameter[];

/** The farm's settings as the Owner reads them, every one of them. */
const settingsOf = async (client: Awaited<ReturnType<typeof as>>["client"]) => {
  const farm = await client.farm.current();
  if (!farm || !("digestTimes" in farm)) {
    throw new Error("The Owner reads the farm's settings in full");
  }
  return farm;
};

const standingNumbers = async () => {
  const { client } = await as("owner");
  const farm = await settingsOf(client);
  return Object.fromEntries(
    NUMBERS.map((key) => [key, farm[key] as number])
  ) as Record<FarmParameter, number>;
};

describe("each Farm Parameter", () => {
  it("is a column on the farm, where its default is kept", () => {
    expectTypeOf<
      Exclude<
        (typeof ALL_FARM_PARAMETERS)[number],
        keyof (typeof farm)["$inferSelect"]
      >
    >().toBeNever();
  });

  it("refuses a figure outside its bounds, either side", async () => {
    const { client } = await as("owner");
    for (const key of NUMBERS) {
      const { min, max } = FARM_PARAMETERS[key];
      for (const figure of [min - 1, max + 1]) {
        // oxlint-disable-next-line no-await-in-loop -- one after another, so a refusal names its own figure
        const refused = await client.farm
          .setParameters({ [key]: figure })
          .then(() => null)
          .catch((error: unknown) => error);
        expect(refused, `${key} at ${figure}`).toMatchObject({
          code: "BAD_REQUEST",
        });
      }
    }
  });

  it("is refused to the Manager where it is the Owner's alone to set", async () => {
    const standing = await standingNumbers();
    const { client } = await as("manager");
    for (const key of parametersOwnersAlone("either")) {
      // oxlint-disable-next-line no-await-in-loop -- one after another, so a refusal names its own Parameter
      const refused = await client.farm
        .setParameters({ [key]: standing[key] })
        .then(() => null)
        .catch((error: unknown) => error);
      expect(refused, key).toMatchObject({
        data: { refusal: "owner_only" },
      });
    }
  });

  it("is the Manager's to set where the Owner has not kept it", async () => {
    const standing = await standingNumbers();
    const keep = new Set(parametersOwnersAlone("either"));
    const his = Object.fromEntries(
      NUMBERS.filter((key) => !keep.has(key)).map((key) => [key, standing[key]])
    );
    const { client } = await as("manager");
    await expect(client.farm.setParameters(his)).resolves.toBeDefined();
  });

  it("is hidden from the Manager only where the Owner keeps it to read as well", async () => {
    const { client } = await as("manager");
    const seen = await client.farm.current();
    for (const key of parametersOwnersAlone("to set and read")) {
      expect(seen, key).not.toHaveProperty(key);
    }
    for (const key of parametersOwnersAlone("to set")) {
      expect(seen, key).toHaveProperty(key);
    }
  });

  it("is on the trail as it stood before it was saved", async () => {
    const standing = await standingNumbers();
    const { client, context } = await as("owner");
    const farm = await settingsOf(client);
    const times = {
      digestTimes: farm.digestTimes,
      quietFrom: farm.quietFrom,
      quietUntil: farm.quietUntil,
    };
    await client.farm.setParameters({ ...standing, ...times });
    const [event] = await scratchDb().query.auditEvent.findMany({
      where: { entity: "farm", entityId: context.farm?.id, action: "update" },
      orderBy: { receivedAt: "desc", id: "desc" },
      limit: 1,
    });
    const before = event?.before as Record<string, unknown> | undefined;
    for (const key of ALL_FARM_PARAMETERS) {
      expect(before, key).toHaveProperty(key);
    }
    for (const key of NUMBERS) {
      expect(before?.[key], key).toBe(standing[key]);
    }
  });
});
