import { and, eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A pen built for twelve with eighteen in it is where the feet go bad, the trough is fought over and the shy heifer
 * does not eat. The Owner or the Manager says how many head each Pen holds, and the farm's Pens read against it.
 */
const suffix = `pen-capacity-${Date.now()}`;
const AT = "2086-03-01T04:00:00.000Z";

const as = (role: "owner" | "manager" | "staff") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(AT) });

const heifer = (penId: string) => ({
  sex: "female" as const,
  side: "dairy" as const,
  state: "heifer" as const,
  penId,
  source: "born" as const,
  aliases: [],
});

/** The Pen as the farm's list of Sheds has it. */
const penOf = async (penId: string) => {
  const { client } = await as("manager");
  const sheds = await client.sheds.list();
  return sheds.flatMap((shed) => shed.pens).find((pen) => pen.id === penId);
};

describe("how many head a Pen holds", () => {
  it("is set by the Manager, and the Pen reads how many stand in it against it", async () => {
    const manager = await as("manager");
    const shed = await manager.client.sheds.create({ name: suffix });
    const small = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `ছোট ${suffix}`,
    });
    await manager.client.animals.register(heifer(small.id));
    await manager.client.animals.register(heifer(small.id));
    await manager.client.animals.register(heifer(small.id));
    await expect(penOf(small.id)).resolves.toMatchObject({
      head: 3,
      capacity: null,
    });
    await manager.client.sheds.pens.setCapacity({
      penId: small.id,
      capacity: 2,
    });
    await expect(penOf(small.id)).resolves.toMatchObject({
      head: 3,
      capacity: 2,
    });
    // And cleared again, when the pen is rebuilt and nobody has counted its stalls.
    const owner = await as("owner");
    await owner.client.sheds.pens.setCapacity({
      penId: small.id,
      capacity: null,
    });
    await expect(penOf(small.id)).resolves.toMatchObject({ capacity: null });
  });

  it("counts only the animals still standing", async () => {
    const manager = await as("manager");
    const shed = await manager.client.sheds.create({ name: `২ ${suffix}` });
    const pen = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `বিক্রি ${suffix}`,
    });
    const gone = await manager.client.animals.register(heifer(pen.id));
    await manager.client.animals.register(heifer(pen.id));
    // Gone by whatever record took her: her Pen is still the last she stood in.
    await scratchDb()
      .update(animal)
      .set({ state: "culled" })
      .where(
        and(
          eq(animal.farmId, theFarm().id),
          eq(animal.tagNumber, gone.tagNumber)
        )
      );
    await expect(penOf(pen.id)).resolves.toMatchObject({ head: 1 });
  });

  it("is not Barn Staff's to set, nor nothing, nor another farm's", async () => {
    const manager = await as("manager");
    const shed = await manager.client.sheds.create({ name: `৩ ${suffix}` });
    const pen = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `কর্মী ${suffix}`,
    });
    const staff = await as("staff");
    await expect(
      staff.client.sheds.pens.setCapacity({ penId: pen.id, capacity: 10 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.sheds.pens.setCapacity({ penId: pen.id, capacity: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      manager.client.sheds.pens.setCapacity({
        penId: "no-such-pen",
        capacity: 10,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
