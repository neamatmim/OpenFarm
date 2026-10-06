import { and, eq } from "@OpenFarm/db/operators";
import { roleAssignment } from "@OpenFarm/db/schema/farm";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A notice whose people are not on the farm — the Vet gone, no Manager yet — still reaches somebody: the Owner, who is
// always there. Told once, it is told; the sweep does not go on saying so to nobody on every turn.

const suffix = `nobody-${Date.now()}`;
const NOW = "2075-03-10T06:00:00.000Z";

const as = (role: "owner" | "manager" | "vet", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let productId = "";
let penId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const vet = await as("vet");
  await as("manager");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `গাভী পেন ${suffix}`,
  });
  penId = pen.id;
  const product = await vet.client.drugs.create({
    name: { bn: `অক্সিটেট্রাসাইক্লিন ${suffix}` },
    milkWithdrawalDays: 4,
    meatWithdrawalDays: 21,
  });
  productId = product.id;
  // And then the farm's Vet leaves.
  await scratchDb()
    .update(roleAssignment)
    .set({ revokedAt: new Date(NOW) })
    .where(
      and(
        eq(roleAssignment.farmId, theFarm().id),
        eq(roleAssignment.role, "vet")
      )
    );
});

describe("a dose not prescribed on a farm with no Vet", () => {
  it("is told to the Owner, once, and the sweep stops saying it", async () => {
    const owner = await as("owner");
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId,
      source: "born",
      aliases: [`বলার কেউ নেই ${suffix}`],
    });
    const manager = await as("manager");
    const dose = await manager.client.treatments.giveNotPrescribed({
      animalTag: cow.tagNumber,
      productId,
      givenAt: new Date(NOW),
      advice: `গা গরম ${suffix}`,
    });
    for (let turn = 0; turn < 3; turn += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one sweep after another, as the app is opened
      await manager.client.alerts.sweep();
    }
    const told = await scratchDb().query.alert.findMany({
      where: { kind: "dose_not_prescribed", entityId: dose.id },
      columns: { userId: true },
    });
    expect(told).toEqual([{ userId: thePerson("owner").id }]);
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entity: "treatment", entityId: dose.id, action: "update" },
      columns: { id: true },
    });
    expect(trail).toHaveLength(1);
  });
});
